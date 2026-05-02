import emailUtils from '../util/emailUtils.js';
import base64Util from '../util/base64Util.js';
import { JSDOM } from 'jsdom';
import PDFJS from 'pdfjs-dist';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

// Allow tests to inject a custom PDF parser (for mocking)
let _parsePDFBufferFn = null;

function setParsePDFBuffer(fn) {
    _parsePDFBufferFn = fn;
}

async function fetch(address, subject, period) {
    const startDate = new Date(period.year, period.month, 1);
    const endDate = new Date(period.year, period.month, 31);

    const messages = await emailUtils.getMessagesByDateInterval(address, subject, startDate, endDate);
    if (!messages || messages.length === 0) {
        console.error('No email found');
        return [];
    }

    const message = messages[0];
    const parsedData = await parseEmailData(message);

    if (!parsedData) {
        return []
    }
    
    return [parsedData]
}

async function parseEmailData(message) {
    try {
        const html = extractHTMLBody(message);
        if (!html) throw new Error('No HTML body found in CORSAN email');

        const pdfUrl = extractPDFLink(html);
        if (!pdfUrl) throw new Error('No PDF link found in CORSAN email HTML');

        const pdfBuffer = await downloadPDF(pdfUrl);
        const pdfData = await (_parsePDFBufferFn || parsePDFBuffer)(pdfBuffer);

        const value = extractTotalFromPDF(pdfData);
        const dueDate = extractDueDateFromPDF(pdfData);
        const referencePeriod = extractReferencePeriodFromPDF(pdfData);

        console.log(`Extracted from CORSAN PDF: dueDate=${dueDate}, value=${value}, referencePeriod=${referencePeriod}`);

        return { dueDate, value, referencePeriod };
    } catch (e) {
        console.error('Failed to parse CORSAN email:', e.message);
        return null;
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
    try {
        const pdf = await PDFJS.getDocument({ data: new Uint8Array(buffer) }).promise;
        
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            const texts = textContent.items.map(item => ({
                x: item.transform[4],
                y: item.transform[5],
                R: [{ T: encodeURIComponent(item.str) }]
            }));
            
            pages.push({ Texts: texts });
        }
        
        return { Pages: pages };
    } catch (e) {
        console.error('Failed to parse PDF with pdf.js:', e.message);
        throw new Error('Failed to parse CORSAN PDF');
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
    // Pass 1: inline total — "TOTAL (R$) 150,75" in one text item
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

    // Pass 2: separate label + value on same line (proximity ±15px)
    for (const page of pdfData.Pages) {
        let totalY = null;
        const totalItems = [];
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toUpperCase().includes('TOTAL') && decoded.includes('R$')) {
                totalY = text.y;
                totalItems.push(text);
            }
        }
        if (totalY !== null) {
            const candidates = page.Texts.filter(t =>
                Math.abs(t.y - totalY) < 15 && !totalItems.includes(t)
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

    console.error('CORSAN PDF debug — all text items:');
    for (const page of pdfData.Pages) {
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            console.error(`  x=${text.x}, y=${text.y} => "${decoded}"`);
        }
    }
    throw new Error('TOTAL (R$) not found in CORSAN PDF');
}

function extractDueDateFromPDF(pdfData) {
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;

    // Pass 1: Look for "Vencimento" with date on same line
    for (const page of pdfData.Pages) {
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toLowerCase().includes('vencimento')) {
                const match = decoded.match(dateRegex);
                if (match) {
                    return parseDDMMYYYY(match[1]);
                }
            }
        }
    }

    // Pass 2: Look for "Venc." or other shortened labels with date on same line
    for (const page of pdfData.Pages) {
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toLowerCase().includes('venc.')) {
                const match = decoded.match(dateRegex);
                if (match) {
                    return parseDDMMYYYY(match[1]);
                }
            }
        }
    }

    // Pass 3: Find "Vencimento" header, then search nearby y lines for date
    for (const page of pdfData.Pages) {
        let vencItem = null;

        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toLowerCase().includes('vencimento')) {
                vencItem = text;
            }
        }

        if (!vencItem) continue;

        // Find candidates on nearby y lines (increased tolerance to 50px)
        const candidates = page.Texts.filter(t => {
            if (t === vencItem) return false;
            const decoded = decodeText(t.R[0].T);
            if (decoded.toLowerCase().includes('emiss')) return false;
            if (Math.abs(t.y - vencItem.y) > 50) return false;
            return decoded.match(dateRegex);
        });

        candidates.sort((a, b) => Math.abs(a.x - vencItem.x) - Math.abs(b.x - vencItem.x));

        for (const candidate of candidates) {
            const decoded = decodeText(candidate.R[0].T);
            const match = decoded.match(dateRegex);
            if (match) {
                return parseDDMMYYYY(match[1]);
            }
        }
    }

    // Pass 4: Broader search - find any date that appears near "vencimento" anywhere on page
    for (const page of pdfData.Pages) {
        let vencItem = null;
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toLowerCase().includes('venc')) {
                vencItem = text;
                break;
            }
        }

        if (!vencItem) continue;

        // Find all dates on same horizontal band (within 100px vertically)
        const candidates = page.Texts.filter(t => {
            const decoded = decodeText(t.R[0].T);
            return Math.abs(t.y - vencItem.y) < 100 && decoded.match(dateRegex);
        });

        if (candidates.length > 0) {
            candidates.sort((a, b) => Math.abs(a.x - vencItem.x) - Math.abs(b.x - vencItem.x));
            const match = decodeText(candidates[0].R[0].T).match(dateRegex);
            if (match) return parseDDMMYYYY(match[1]);
        }
    }

    console.error('CORSAN PDF debug — all text items (due date):');
    for (const page of pdfData.Pages) {
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            console.error(`  x=${text.x}, y=${text.y} => "${decoded}"`);
        }
    }
    console.error('Vencimento not found in CORSAN PDF');
    return null;
}

function extractReferencePeriodFromPDF(pdfData) {
    const monthMap = {
        jan: '01', janv: '01', janeiro: '01',
        fev: '02', feb: '02', fevereiro: '02',
        mar: '03', marzo: '03', março: '03',
        abr: '04', avr: '04', abril: '04',
        mai: '05', mayo: '05', maio: '05',
        jun: '06', junio: '06', junho: '06',
        jul: '07', julio: '07', julho: '07',
        ago: '08', agos: '08', agosto: '08',
        set: '09', sept: '09', out: '09', outubro: '10',
        nov: '11', noviembre: '11', novembro: '11',
        dez: '12', dec: '12', diciembre: '12', dezembro: '12'
    };

    for (const page of pdfData.Pages) {
        let refY = null;
        for (const text of page.Texts) {
            const decoded = decodeText(text.R[0].T);
            if (decoded.toUpperCase().includes('REFERÊNCIA') || decoded.toUpperCase().includes('REFERENCIA')) {
                // Check if the date is on the same line
                const monthMatch = decoded.match(/([A-Za-z]{2,})\/(\d{4})/);
                if (monthMatch) {
                    const [, monthStr, year] = monthMatch;
                    const monthNum = monthMap[monthStr.toLowerCase()];
                    if (monthNum) return `${monthNum}/${year}`;
                }
                refY = text.y;
            }
        }
        // Check nearby items on the same line as "REFERÊNCIA"
        if (refY !== null) {
            const candidates = page.Texts.filter(t => Math.abs(t.y - refY) < 15);
            for (const candidate of candidates) {
                const decoded = decodeText(candidate.R[0].T);
                const monthMatch = decoded.match(/([A-Za-z]{2,})\/(\d{4})/);
                if (monthMatch) {
                    const [, monthStr, year] = monthMatch;
                    const monthNum = monthMap[monthStr.toLowerCase()];
                    if (monthNum) return `${monthNum}/${year}`;
                }
            }
        }
    }

    return null;
}

function parseDDMMYYYY(str) {
    const [day, month, year] = str.split('/').map(Number);
    return new Date(year, month - 1, day);
}

export { fetch, parseEmailData, extractHTMLBody, extractPDFLink, extractTotalFromPDF, extractDueDateFromPDF, extractReferencePeriodFromPDF, setParsePDFBuffer };
export default { fetch };
