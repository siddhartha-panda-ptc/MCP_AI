#!/usr/bin/env node
/**
 * Step Recorder MCP Server with Auto Browser Capture
 * Automatically launches browser and captures all real interactions
 */
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "fs";
import { chromium } from "playwright";
const recordedSteps = [];
let stepCounter = 0;
let browser = null;
let context = null;
let page = null;
// Generate filename with format TestSteps_{dd/mm/yy_timestamp}
function generateStepsFilename() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `TestSteps_${day}-${month}-${year}_${hours}-${minutes}-${seconds}.txt`;
}
const STEPS_FILE = generateStepsFilename();
// Save formatted steps to file
function saveFormattedSteps() {
    try {
        let output = "═══════════════════════════════════════════════════════\n";
        output += "        LIVE BROWSER INTERACTIONS CAPTURED\n";
        output += "═══════════════════════════════════════════════════════\n\n";
        output += "Session Started: " + (recordedSteps.length > 0 ? recordedSteps[0].timestamp : new Date().toISOString()) + "\n\n";
        output += "───────────────────────────────────────────────────────\n\n";
        recordedSteps.forEach((s) => {
            output += "Step " + s.stepNumber + ": " + s.step + "\n\n";
        });
        output += "───────────────────────────────────────────────────────\n";
        output += "End of Recording - " + new Date().toLocaleString() + "\n";
        output += "═══════════════════════════════════════════════════════\n";
        fs.writeFileSync(STEPS_FILE, output, "utf-8");
    }
    catch (error) {
        console.error("Error saving steps:", error);
    }
}
// Record a browser interaction
function recordInteraction(description) {
    stepCounter++;
    const timestamp = new Date().toISOString();
    recordedSteps.push({
        timestamp,
        step: description,
        stepNumber: stepCounter
    });
    saveFormattedSteps();
    console.error("✓ Step " + stepCounter + ": " + description);
}
// Launch browser and set up event listeners
async function launchBrowserWithCapture() {
    try {
        console.error("\n🚀 Launching browser with interaction capture...");
        // Launch browser
        browser = await chromium.launch({
            headless: false,
            args: ['--start-maximized']
        });
        context = await browser.newContext({
            viewport: null
        });
        page = await context.newPage();
        recordInteraction("Browser launched successfully");
        // Navigate to Google
        await page.goto("http://google.com");
        recordInteraction("Navigated to http://google.com");
        // Set up navigation listener
        page.on('framenavigated', async (frame) => {
            if (frame === page.mainFrame()) {
                const url = frame.url();
                if (!url.includes('about:blank') && !url.includes('google.com/')) {
                    recordInteraction("Navigated to " + url);
                }
            }
        });
        // Track input fields being filled using polling
        const trackedInputs = new Map();
        setInterval(async () => {
            if (!page)
                return;
            try {
                const inputs = await page.evaluate(() => {
                    const allInputs = [];
                    const elements = document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], input[type="password"], input:not([type]), textarea');
                    elements.forEach((el) => {
                        const input = el;
                        if (input.value && input.value.trim().length > 0) {
                            const selector = input.name || input.id || input.placeholder || input.tagName.toLowerCase();
                            allInputs.push({
                                selector: selector,
                                value: input.value
                            });
                        }
                    });
                    return allInputs;
                });
                // Check for new or changed values
                inputs.forEach(({ selector, value }) => {
                    const key = selector;
                    const lastValue = trackedInputs.get(key);
                    if (lastValue !== value) {
                        trackedInputs.set(key, value);
                        // Always record, even for initial values
                        recordInteraction("Entered \"" + value + "\" into " + selector);
                    }
                });
            }
            catch (err) {
                // Page might be navigating, ignore
            }
        }, 1000); // Check every second
        // Track clicks using console messages
        page.on('console', async (msg) => {
            const text = msg.text();
            if (text.startsWith('CLICK:')) {
                const parts = text.substring(6).split('|');
                recordInteraction("Clicked on \"" + parts[1] + "\" (" + parts[0] + ")");
            }
        });
        // Inject click tracking via console
        await page.addInitScript(() => {
            document.addEventListener('click', (e) => {
                const target = e.target;
                const tagName = target.tagName.toLowerCase();
                const text = target.textContent?.trim().substring(0, 50) || target.getAttribute('aria-label') || '';
                const selector = tagName + (target.id ? '#' + target.id : '') + (target.className ? '.' + target.className.split(' ')[0] : '');
                console.log('CLICK:' + selector + '|' + text);
            }, true);
        });
        console.error("✓ Browser capture activated!");
        console.error("✓ All interactions will be recorded to: " + STEPS_FILE);
        console.error("\n👉 Use the browser - all your actions will be captured!\n");
    }
    catch (error) {
        console.error("Error launching browser:", error);
    }
}
// Create MCP server
const server = new McpServer({
    name: "step-recorder-with-browser",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
        resources: {},
    },
});
// Handle tool list
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "get_steps",
            description: "Get all captured browser interactions",
            inputSchema: {
                type: "object",
                properties: {},
            },
        },
        {
            name: "clear_steps",
            description: "Clear all captured interactions",
            inputSchema: {
                type: "object",
                properties: {},
            },
        },
        {
            name: "record_manual_note",
            description: "Manually add a note to the recording",
            inputSchema: {
                type: "object",
                properties: {
                    note: z.string().describe("Note to add"),
                },
                required: ["note"],
            },
        },
    ],
}));
// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    switch (name) {
        case "get_steps":
            return {
                content: [
                    {
                        type: "text",
                        text: "Captured " + recordedSteps.length + " browser interactions:\n\n" +
                            recordedSteps.map(s => "Step " + s.stepNumber + ": " + s.step + " [" + s.timestamp + "]").join("\n"),
                    },
                ],
            };
        case "clear_steps": {
            const count = recordedSteps.length;
            recordedSteps.length = 0;
            stepCounter = 0;
            saveFormattedSteps();
            return {
                content: [
                    {
                        type: "text",
                        text: "Cleared " + count + " captured interactions",
                    },
                ],
            };
        }
        case "record_manual_note": {
            const note = args.note;
            recordInteraction("Note: " + note);
            return {
                content: [
                    {
                        type: "text",
                        text: "Note recorded",
                    },
                ],
            };
        }
        default:
            throw new Error("Unknown tool: " + name);
    }
});
// Handle resource list
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
        {
            uri: "interactions://live",
            name: "Live Browser Interactions",
            description: "View all captured browser interactions",
            mimeType: "text/plain",
        },
    ],
}));
// Handle resource read
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === "interactions://live") {
        const stepsList = recordedSteps
            .map(s => "Step " + s.stepNumber + ": [" + s.timestamp + "] " + s.step)
            .join("\n");
        return {
            contents: [
                {
                    uri: "interactions://live",
                    mimeType: "text/plain",
                    text: "Live Browser Interactions:\n\n" + stepsList,
                },
            ],
        };
    }
    throw new Error("Unknown resource: " + uri);
});
// Start server and launch browser
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("═══════════════════════════════════════════════════════");
    console.error("  Step Recorder MCP - Auto Browser Capture Mode");
    console.error("═══════════════════════════════════════════════════════");
    // Launch browser automatically
    await launchBrowserWithCapture();
    console.error("\nMCP Server ready on stdio");
}
// Cleanup on exit
process.on('SIGINT', async () => {
    console.error("\n\nShutting down...");
    if (page)
        await page.close();
    if (context)
        await context.close();
    if (browser)
        await browser.close();
    console.error("✓ Browser closed");
    console.error("✓ All interactions saved to: " + STEPS_FILE);
    process.exit(0);
});
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
