import emailUtils from '../util/emailUtils.js';
import base64Util from '../util/base64Util.js';
import { JSDOM } from 'jsdom';
import PDFParser from 'pdf2json';
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
    return link ? link.href : null;
}

async function downloadPDF(url) {
    const response = await globalThis.fetch(url);
    if (!response.ok) {
        throw new Error(`PDF download failed: HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    const filename = `corsan_fatura_${Date.now()}.pdf`;
    fs.writeFileSync(path.join(DOWNLOADS_DIR, filename), buffer);

    return buffer;
}

async function parsePDFBuffer(buffer) {
    const parser = new PDFParser();

    const pdfPromise = new Promise((resolve, reject) => {
        parser.on('pdfParser_dataReady', pdfData => resolve(pdfData));
        parser.on('pdfParser_dataError', errData => reject(errData.parserError));
    });

    const uint8 = new Uint8Array(buffer);
    parser.parseBuffer(uint8);

    return pdfPromise;
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
