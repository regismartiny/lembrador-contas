import emailUtils from '../util/emailUtils.js';
import base64Util from '../util/base64Util.js';
import { JSDOM } from 'jsdom';
import PDFParser from 'pdf2json';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

async function fetch(address, subject, period) {
    const startDate = new Date(period.year, period.month, 1);
    const endDate = new Date(period.year, period.month, 31);

    const messages = await emailUtils.getMessagesByDateInterval(address, subject, startDate, endDate);
    if (!messages || messages.length === 0) {
        console.error('No email found');
        return [];
    }

    try {
        const message = messages[0];

        const html = extractHTMLBody(message);
        if (!html) throw new Error('No HTML body found in CORSAN email');

        const pdfUrl = extractPDFLink(html);
        if (!pdfUrl) throw new Error('No PDF link found in CORSAN email HTML');

        const pdfBuffer = await downloadPDF(pdfUrl);
        const pdfData = await parsePDFBuffer(pdfBuffer);

        const value = extractTotalFromPDF(pdfData);
        const dueDate = extractDueDateFromPDF(pdfData);

        return [{ dueDate, value }];
    } catch (e) {
        console.error('Failed to parse CORSAN email:', e.message);
        return [];
    }
}

function findHTMLPart(payload) {
    if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
        return payload.body.data;
    }
    if (payload.parts) {
        for (const part of payload.parts) {
            const result = findHTMLPart(part);
            if (result) return result;
        }
    }
    return null;
}

function extractHTMLBody(message) {
    const encodedData = findHTMLPart(message.payload);
    if (!encodedData) return null;
    const fixed = base64Util.fixBase64(encodedData);
    return base64Util.base64ToText(fixed);
}

function extractPDFLink(html) {
    const dom = new JSDOM(html);
    const anchors = dom.window.document.querySelectorAll('a');
    const link = Array.from(anchors).find(a =>
        a.textContent.includes('Clique aqui para ver sua fatura')
    );
    if (!link) return null;
    return link.getAttribute('href') || link.href;
}

async function downloadPDF(url) {
    console.log('CORSAN PDF URL:', url);
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        
        // Set user agent to avoid blocking
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set up response handler to capture the PDF download
        const pdfBuffer = await new Promise(async (resolve, reject) => {
            let resolved = false;
            let apiResponseData = null;
            
            const responseHandler = async (response) => {
                try {
                    const contentType = response.headers()['content-type'] || '';
                    const status = response.status();
                    const responseUrl = response.url();
                    
                    console.log(`Response: ${responseUrl} - Status: ${status} - Content-Type: ${contentType}`);
                    
                    // Try to get the buffer for all successful responses
                    if (status >= 200 && status < 400) {
                        try {
                            const buffer = await response.buffer();
                            
                            // Check if it's a PDF by magic number
                            if (buffer.length > 5 && buffer.toString('ascii', 0, 5).startsWith('%PDF')) {
                                console.log('PDF found! Size:', buffer.length);
                                if (!resolved) {
                                    resolved = true;
                                    resolve(buffer);
                                }
                                return;
                            }
                            
                            // Accept if content-type indicates PDF
                            if (contentType.includes('application/pdf')) {
                                console.log('PDF detected by content-type! Size:', buffer.length);
                                if (!resolved) {
                                    resolved = true;
                                    resolve(buffer);
                                }
                                return;
                            }
                            
                            // Check if this is the API response with PDF data
                            if (responseUrl.includes('/fatura-eletronica/download') && contentType.includes('application/json')) {
                                try {
                                    const text = buffer.toString('utf-8');
                                    const json = JSON.parse(text);
                                    console.log('API Response:', JSON.stringify(json).substring(0, 500));
                                    apiResponseData = json;
                                    
                                    // Check for base64 bytes in response.content.bytes (new format)
                                    if (json.content && json.content.bytes) {
                                        console.log('Found bytes in response.content');
                                        try {
                                            const pdfData = Buffer.from(json.content.bytes, 'base64');
                                            if (pdfData.toString('ascii', 0, 5).startsWith('%PDF')) {
                                                console.log('PDF decoded from base64! Size:', pdfData.length);
                                                if (!resolved) {
                                                    resolved = true;
                                                    resolve(pdfData);
                                                }
                                                return;
                                            }
                                        } catch (e) {
                                            console.log('Failed to decode base64 bytes:', e.message);
                                        }
                                    }
                                    
                                    // Check if there's base64 encoded PDF data in dados.arquivo (legacy format)
                                    if (json.dados && json.dados.arquivo) {
                                        console.log('Found arquivo in response');
                                        let pdfData = json.dados.arquivo;
                                        
                                        // If it's base64 encoded
                                        if (typeof pdfData === 'string' && !pdfData.startsWith('%PDF')) {
                                            try {
                                                pdfData = Buffer.from(pdfData, 'base64');
                                            } catch (e) {
                                                console.log('Failed to decode base64:', e.message);
                                            }
                                        }
                                        
                                        if (Buffer.isBuffer(pdfData) && pdfData.toString('ascii', 0, 5).startsWith('%PDF')) {
                                            console.log('PDF decoded from base64! Size:', pdfData.length);
                                            if (!resolved) {
                                                resolved = true;
                                                resolve(pdfData);
                                            }
                                            return;
                                        }
                                    }
                                    
                                    // Check for URL pointing to PDF
                                    if (json.url || json.downloadUrl || json.pdfUrl) {
                                        const pdfUrl = json.url || json.downloadUrl || json.pdfUrl;
                                        console.log('Found PDF URL in API response:', pdfUrl);
                                    }
                                } catch (e) {
                                    console.log('Could not parse API response as JSON:', e.message);
                                }
                            }
                        } catch (e) {
                            console.log('Error reading response buffer:', e.message);
                        }
                    }
                } catch (e) {
                    console.log('Error in response handler:', e.message);
                }
            };
            
            page.on('response', responseHandler);
            
            // Navigate to the URL
            try {
                const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                console.log('Page navigation completed. Status:', response?.status());
            } catch (e) {
                console.log('Navigation error (may still succeed if PDF was captured):', e.message);
            }
            
            // Wait for potential delayed downloads
            await new Promise(r => setTimeout(r, 5000));
            
            // If no PDF found yet, try to find download links on the page
            if (!resolved) {
                try {
                    const downloadLinks = await page.evaluate(() => {
                        const links = [];
                        document.querySelectorAll('a[href*=".pdf"], a[download*=".pdf"], a[href*="download"]').forEach(link => {
                            links.push(link.href);
                        });
                        return links;
                    });
                    
                    if (downloadLinks.length > 0) {
                        console.log('Found download links on page:', downloadLinks);
                        const downloadUrl = downloadLinks[0];
                        console.log('Trying to download from found link:', downloadUrl);
                        await page.goto(downloadUrl, { waitUntil: 'networkidle0', timeout: 30000 });
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (e) {
                    console.log('Error searching for download links:', e.message);
                }
            }
            
            if (!resolved) {
                reject(new Error('No PDF received from URL: ' + url));
            }
        });
        
        if (!pdfBuffer.toString('ascii', 0, 5).startsWith('%PDF')) {
            throw new Error('Downloaded content is not a valid PDF');
        }
        
        fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
        const filename = `corsan_fatura_${Date.now()}.pdf`;
        fs.writeFileSync(path.join(DOWNLOADS_DIR, filename), pdfBuffer);
        
        return pdfBuffer;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

async function parsePDFBuffer(buffer) {
    const savedWorker = globalThis.Worker;
    globalThis.Worker = undefined;
    try {
        const parser = new PDFParser();

        const pdfPromise = new Promise((resolve, reject) => {
            parser.on('pdfParser_dataReady', pdfData => resolve(pdfData));
            parser.on('pdfParser_dataError', errData => reject(errData.parserError));
        });

        const uint8 = new Uint8Array(buffer);
        parser.parseBuffer(uint8);

        return await pdfPromise;
    } finally {
        globalThis.Worker = savedWorker;
    }
}

function decodeText(text) {
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

function extractTotalFromPDF(pdfData) {
    for (const page of pdfData.Pages) {
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toUpperCase().includes('TOTAL') && decoded.includes('R$')) {
                const match = decoded.match(/(\d+[\.,]\d{2})/);
                if (match) {
                    return parseFloat(match[1].replace(',', '.'));
                }
            }
        }
    }

    for (const page of pdfData.Pages) {
        let totalY = null;
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toUpperCase().includes('TOTAL') && decoded.includes('R$')) {
                totalY = text.y;
                break;
            }
        }
        if (totalY !== null) {
            const candidates = page.Texts.filter(t =>
                Math.abs(t.y - totalY) < 2 && t !== page.Texts.find(pt => decodeText(pt.R[0].T).toUpperCase().includes('TOTAL'))
            );
            for (const candidate of candidates) {
                const decoded = decodeText(candidate.R[0].T);
                const match = decoded.match(/^(\d+[\.,]\d{2})$/);
                if (match) {
                    return parseFloat(match[1].replace(',', '.'));
                }
            }
        }
    }

    throw new Error('TOTAL (R$) not found in CORSAN PDF');
}

function extractDueDateFromPDF(pdfData) {
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
    for (const page of pdfData.Pages) {
        let vencY = null;
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toLowerCase().includes('vencimento')) {
                const match = decoded.match(dateRegex);
                if (match) {
                    return parseDDMMYYYY(match[1]);
                }
                vencY = text.y;
                break;
            }
        }
        if (vencY !== null) {
            const candidates = page.Texts.filter(t =>
                Math.abs(t.y - vencY) < 2 && t !== page.Texts.find(pt =>
                    decodeText(pt.R[0].T).toLowerCase().includes('vencimento')
                )
            );
            for (const candidate of candidates) {
                const decoded = decodeText(candidate.R[0].T);
                const match = decoded.match(dateRegex);
                if (match) {
                    return parseDDMMYYYY(match[1]);
                }
            }
        }
    }

    console.error('Vencimento not found in CORSAN PDF');
    return null;
}

function parseDDMMYYYY(str) {
    const [day, month, year] = str.split('/').map(Number);
    return new Date(year, month - 1, day);
}

export { fetch, extractHTMLBody, extractPDFLink, extractTotalFromPDF, extractDueDateFromPDF };
export default { fetch };
