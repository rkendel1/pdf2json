import {kFontStyles} from "./pdfconst.js";

const HEADING_SIZE_RATIO_L1 = 1.5; // 50% larger than body font size → heading level 1
const HEADING_SIZE_RATIO_L2 = 1.2; // 20% larger than body font size → heading level 2

function getTextFromBlock(textBlock) {
    return textBlock.R.map(run => decodeURIComponent(run.T)).join('');
}

function getFontSize(textBlock) {
    const run = textBlock.R[0];
    if (run.S >= 0 && run.S < kFontStyles.length) {
        return kFontStyles[run.S][1];
    }
    return run.TS[1];
}

function isBold(textBlock) {
    const run = textBlock.R[0];
    if (run.S >= 0 && run.S < kFontStyles.length) {
        return kFontStyles[run.S][2] === 1;
    }
    return run.TS[2] === 1;
}

export default class PDFPostProcessor {
    #pages = null;

    constructor(pages) {
        this.#pages = pages || [];
    }

    #collectTextBlocks() {
        const allBlocks = [];
        this.#pages.forEach((page, pageIndex) => {
            (page.Texts || []).forEach(block => {
                allBlocks.push({ pageIndex, block });
            });
        });
        return allBlocks;
    }

    #getBodyFontSize(allBlocks) {
        if (allBlocks.length === 0) return 12;

        const sizeCounts = {};
        allBlocks.forEach(({ block }) => {
            const size = getFontSize(block);
            sizeCounts[size] = (sizeCounts[size] || 0) + 1;
        });

        let maxCount = 0;
        let bodySize = 12;
        for (const [size, count] of Object.entries(sizeCounts)) {
            if (count > maxCount) {
                maxCount = count;
                bodySize = parseFloat(size);
            }
        }
        return bodySize;
    }

    #classifyBlock(block, bodyFontSize) {
        const fontSize = getFontSize(block);
        const bold = isBold(block);

        if (fontSize >= bodyFontSize * HEADING_SIZE_RATIO_L1) {
            return { type: 'heading', level: 1 };
        }
        if (fontSize >= bodyFontSize * HEADING_SIZE_RATIO_L2) {
            return { type: 'heading', level: 2 };
        }
        if (bold && fontSize >= bodyFontSize) {
            return { type: 'heading', level: 3 };
        }
        return { type: 'paragraph', level: null };
    }

    getSemantics() {
        const allBlocks = this.#collectTextBlocks();

        if (allBlocks.length === 0) {
            return { Sections: [] };
        }

        const bodyFontSize = this.#getBodyFontSize(allBlocks);
        const sections = [];
        let currentSection = null;

        allBlocks.forEach(({ pageIndex, block }) => {
            const text = getTextFromBlock(block);
            if (!text.trim()) return;

            const { type, level } = this.#classifyBlock(block, bodyFontSize);

            if (type === 'heading') {
                const headingElement = {
                    type: 'heading',
                    level,
                    text,
                    pageIndex,
                    x: block.x,
                    y: block.y
                };
                currentSection = {
                    title: text,
                    level,
                    pageIndex,
                    content: [headingElement]
                };
                sections.push(currentSection);
            } else {
                if (!currentSection) {
                    currentSection = {
                        title: null,
                        level: 0,
                        pageIndex,
                        content: []
                    };
                    sections.push(currentSection);
                }
                currentSection.content.push({
                    type: 'paragraph',
                    text,
                    pageIndex,
                    x: block.x,
                    y: block.y
                });
            }
        });

        return { Sections: sections };
    }
}
