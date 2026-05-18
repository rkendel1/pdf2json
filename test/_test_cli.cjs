'use strict';

const path = require('path');

// ─── Unit tests for PDFPostProcessor ───────────────────────────────────────

describe('PDFPostProcessor', () => {
    let PDFPostProcessor;

    beforeAll(async () => {
        const mod = await import('../lib/pdfpostprocessor.js');
        PDFPostProcessor = mod.default;
    });

    test('returns empty Sections for empty pages array', () => {
        const processor = new PDFPostProcessor([]);
        expect(processor.getSemantics()).toEqual({ Sections: [] });
    });

    test('returns empty Sections for pages with no Texts', () => {
        const processor = new PDFPostProcessor([{ Texts: [] }]);
        expect(processor.getSemantics()).toEqual({ Sections: [] });
    });

    test('returns empty Sections when all text is whitespace', () => {
        const block = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: '%20', S: -1, TS: [0, 12, 0, 0] }] };
        const processor = new PDFPostProcessor([{ Texts: [block] }]);
        expect(processor.getSemantics()).toEqual({ Sections: [] });
    });

    test('detects heading by large font size (level 1)', () => {
        // body font size = 12 (most common). Large text at 24 => 24/12 = 2.0 >= 1.5 → H1
        const body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'body%20text', S: -1, TS: [0, 12, 0, 0] }] };
        const heading = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'Big%20Title', S: -1, TS: [0, 24, 0, 0] }] };
        // Many body blocks so 12 is the most common font size
        const processor = new PDFPostProcessor([{ Texts: [body, body, body, heading, body] }]);
        const result = processor.getSemantics();

        const headingSection = result.Sections.find(s => s.title === 'Big Title');
        expect(headingSection).toBeDefined();
        expect(headingSection.level).toBe(1);
        expect(headingSection.content[0].type).toBe('heading');
        expect(headingSection.content[0].level).toBe(1);
    });

    test('detects heading by medium font size (level 2)', () => {
        // body font size = 10. Medium text at 14 => 14/10 = 1.4 >= 1.2 → H2
        const body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'text', S: -1, TS: [0, 10, 0, 0] }] };
        const heading = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'Sub%20Title', S: -1, TS: [0, 14, 0, 0] }] };
        const processor = new PDFPostProcessor([{ Texts: [body, body, body, heading, body] }]);
        const result = processor.getSemantics();

        const headingSection = result.Sections.find(s => s.title === 'Sub Title');
        expect(headingSection).toBeDefined();
        expect(headingSection.level).toBe(2);
    });

    test('detects bold text as heading (level 3)', () => {
        // Same font size but bold → H3
        const body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'normal', S: -1, TS: [0, 12, 0, 0] }] };
        const boldBlock = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'Bold%20Heading', S: -1, TS: [0, 12, 1, 0] }] };
        const processor = new PDFPostProcessor([{ Texts: [body, body, body, boldBlock, body] }]);
        const result = processor.getSemantics();

        const headingSection = result.Sections.find(s => s.title === 'Bold Heading');
        expect(headingSection).toBeDefined();
        expect(headingSection.level).toBe(3);
        expect(headingSection.content[0].type).toBe('heading');
    });

    test('groups paragraph content under its preceding heading', () => {
        const heading = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'Section%201', S: -1, TS: [0, 24, 0, 0] }] };
        const para1 = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'First%20para', S: -1, TS: [0, 12, 0, 0] }] };
        const para2 = { x: 1, y: 3, w: 5, sw: 1, R: [{ T: 'Second%20para', S: -1, TS: [0, 12, 0, 0] }] };
        // Three body blocks so 12 is most common
        const body = { x: 1, y: 4, w: 5, sw: 1, R: [{ T: 'extra', S: -1, TS: [0, 12, 0, 0] }] };
        const processor = new PDFPostProcessor([{ Texts: [body, body, body, heading, para1, para2] }]);
        const result = processor.getSemantics();

        const section = result.Sections.find(s => s.title === 'Section 1');
        expect(section).toBeDefined();
        const paragraphs = section.content.filter(e => e.type === 'paragraph');
        expect(paragraphs.length).toBe(2);
        expect(paragraphs[0].text).toBe('First para');
        expect(paragraphs[1].text).toBe('Second para');
    });

    test('pre-heading content is placed in a default section (no title)', () => {
        const heading = { x: 1, y: 3, w: 5, sw: 1, R: [{ T: 'Title', S: -1, TS: [0, 24, 0, 0] }] };
        const intro = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'intro', S: -1, TS: [0, 12, 0, 0] }] };
        // extra body blocks so 12 is most common
        const body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'extra', S: -1, TS: [0, 12, 0, 0] }] };
        const processor = new PDFPostProcessor([{ Texts: [body, body, intro, heading] }]);
        const result = processor.getSemantics();

        // First section should be the un-titled intro section
        const defaultSection = result.Sections[0];
        expect(defaultSection.title).toBeNull();
        expect(defaultSection.level).toBe(0);
        expect(defaultSection.content.some(e => e.text === 'intro')).toBe(true);
    });

    test('section content elements carry pageIndex, x, and y', () => {
        const heading = { x: 2.5, y: 1.0, w: 5, sw: 1, R: [{ T: 'Title', S: -1, TS: [0, 24, 0, 0] }] };
        const body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'text', S: -1, TS: [0, 12, 0, 0] }] };
        const processor = new PDFPostProcessor([{ Texts: [body, body, body, heading] }]);
        const result = processor.getSemantics();

        const section = result.Sections.find(s => s.title === 'Title');
        expect(section.pageIndex).toBe(0);
        expect(section.content[0].x).toBe(2.5);
        expect(section.content[0].y).toBe(1.0);
        expect(section.content[0].pageIndex).toBe(0);
    });

    test('multi-page documents track correct pageIndex per element', () => {
        const page0Heading = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'Page0%20Title', S: -1, TS: [0, 24, 0, 0] }] };
        const page0Body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'text', S: -1, TS: [0, 12, 0, 0] }] };
        const page1Heading = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'Page1%20Title', S: -1, TS: [0, 24, 0, 0] }] };
        const page1Body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'text2', S: -1, TS: [0, 12, 0, 0] }] };
        const processor = new PDFPostProcessor([
            { Texts: [page0Body, page0Body, page0Body, page0Heading] },
            { Texts: [page1Body, page1Body, page1Body, page1Heading] }
        ]);
        const result = processor.getSemantics();

        const s0 = result.Sections.find(s => s.title === 'Page0 Title');
        const s1 = result.Sections.find(s => s.title === 'Page1 Title');
        expect(s0.pageIndex).toBe(0);
        expect(s1.pageIndex).toBe(1);
    });

    test('uses kFontStyles lookup when S is a valid style index', () => {
        // S=4 → kFontStyles[4] = [0, 14, 0, 0] (size 14)
        // body at S=2 → kFontStyles[2] = [0, 10, 0, 0] (size 10); 14/10=1.4 >= 1.2 → H2
        const body = { x: 1, y: 2, w: 5, sw: 1, R: [{ T: 'body', S: 2, TS: [0, 10, 0, 0] }] };
        const heading = { x: 1, y: 1, w: 5, sw: 1, R: [{ T: 'Styled%20Heading', S: 4, TS: [0, 14, 0, 0] }] };
        const processor = new PDFPostProcessor([{ Texts: [body, body, body, heading, body] }]);
        const result = processor.getSemantics();

        const section = result.Sections.find(s => s.title === 'Styled Heading');
        expect(section).toBeDefined();
        expect(section.level).toBe(2);
    });
});

// ─── Integration tests using PDFParser ───────────────────────────────────────

describe('PDFParser.getDocumentSemantics()', () => {
    let PDFParser;
    let parser;
    const testPdfPath = path.join(__dirname, 'pdf/dc/form/DC40.pdf');

    beforeAll(async () => {
        const mod = await import('../pdfparser.js');
        PDFParser = mod.default;

        parser = new PDFParser();
        await new Promise((resolve, reject) => {
            parser.on('pdfParser_dataReady', resolve);
            parser.on('pdfParser_dataError', reject);
            parser.loadPDF(testPdfPath);
        });
    }, 60000);

    afterAll(() => {
        if (parser) parser.destroy();
    });

    test('getDocumentSemantics returns an object with a Sections array', () => {
        const semantics = parser.getDocumentSemantics();
        expect(semantics).toBeDefined();
        expect(semantics).toHaveProperty('Sections');
        expect(Array.isArray(semantics.Sections)).toBe(true);
    });

    test('each Section has required fields', () => {
        const { Sections } = parser.getDocumentSemantics();
        Sections.forEach(section => {
            expect(section).toHaveProperty('level');
            expect(typeof section.level).toBe('number');
            expect(section).toHaveProperty('pageIndex');
            expect(typeof section.pageIndex).toBe('number');
            expect(section).toHaveProperty('content');
            expect(Array.isArray(section.content)).toBe(true);
        });
    });

    test('each content element has required fields and valid type', () => {
        const { Sections } = parser.getDocumentSemantics();
        Sections.forEach(section => {
            section.content.forEach(element => {
                expect(['heading', 'paragraph']).toContain(element.type);
                expect(typeof element.text).toBe('string');
                expect(element.text.length).toBeGreaterThan(0);
                expect(typeof element.pageIndex).toBe('number');
                expect(typeof element.x).toBe('number');
                expect(typeof element.y).toBe('number');
            });
        });
    });

    test('getDocumentSemanticsStream returns a readable stream', () => {
        const stream = parser.getDocumentSemanticsStream();
        expect(stream).toBeDefined();
        expect(typeof stream.pipe).toBe('function');
        expect(typeof stream.read).toBe('function');
    });

    test('stream emits the same data as getDocumentSemantics()', done => {
        const expected = parser.getDocumentSemantics();
        const stream = parser.getDocumentSemanticsStream();
        let received = null;
        stream.on('data', chunk => { received = chunk; });
        stream.on('end', () => {
            expect(received).toEqual(expected);
            done();
        });
        stream.resume();
    });
});
