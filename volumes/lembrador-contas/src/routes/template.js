import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.join(__dirname, '../views/templates');

const isProduction = process.env.NODE_ENV === 'production';

const cachedHead = fs.readFileSync(path.join(templatesDir, 'head.html'), 'utf8');
const cachedNavbar = fs.readFileSync(path.join(templatesDir, 'navbar.html'), 'utf8');
const cachedScripts = fs.readFileSync(path.join(templatesDir, 'scripts.html'), 'utf8');

const template = {
    get head() {
        return isProduction ? cachedHead : fs.readFileSync(path.join(templatesDir, 'head.html'), 'utf8');
    },
    get navbar() {
        return isProduction ? cachedNavbar : fs.readFileSync(path.join(templatesDir, 'navbar.html'), 'utf8');
    },
    get scripts() {
        return isProduction ? cachedScripts : fs.readFileSync(path.join(templatesDir, 'scripts.html'), 'utf8');
    },
};

export default template;
