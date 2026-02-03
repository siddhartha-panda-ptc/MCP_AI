#!/usr/bin/env node

/**
 * Step Recorder MCP Server with Auto Browser Capture
 * Automatically launches browser and captures all real interactions
 */

import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import fs from "fs";
import { chromium, Page, BrowserContext } from "playwright";
import ExcelJS from "exceljs";

// Storage
interface RecordedStep {
  timestamp: string;
  step: string;
  stepNumber: number;
  locator: string;
  expectedResult: string;
}

const recordedSteps: RecordedStep[] = [];
let stepCounter = 0;
let context: BrowserContext | null = null;
let page: Page | null = null;

// Generate filename with format TestSteps_{dd/mm/yy_timestamp}
function generateStepsFilename(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const stepRecorderDir = path.join(process.cwd(), 'StepRecorder');
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(stepRecorderDir)) {
    fs.mkdirSync(stepRecorderDir, { recursive: true });
  }
  
  return path.join(stepRecorderDir, `TestSteps_${day}-${month}-${year}_${hours}-${minutes}-${seconds}.xlsx`);
}

const STEPS_FILE = generateStepsFilename();

// Save formatted steps to Excel file
async function saveFormattedSteps() {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Test Steps');
    
    // Add header row with styling
    worksheet.columns = [
      { header: 'Step No', key: 'stepNumber', width: 10 },
      { header: 'Actual Step', key: 'step', width: 50 },
      { header: 'Locator', key: 'locator', width: 60 },
      { header: 'Expected Results', key: 'expectedResult', width: 40 }
    ];
    
    // Style header row
    worksheet.getRow(1).font = { bold: true, size: 12 };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Add data rows
    recordedSteps.forEach((s) => {
      worksheet.addRow({
        stepNumber: s.stepNumber,
        step: s.step,
        locator: s.locator,
        expectedResult: s.expectedResult
      });
    });
    
    // Auto-fit columns and add borders
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    await workbook.xlsx.writeFile(STEPS_FILE);
  } catch (error) {
    console.error("Error saving steps:", error);
  }
}

// Record a browser interaction
function recordInteraction(description: string, locator: string = '', expectedResult: string = '') {
  stepCounter++;
  const timestamp = new Date().toISOString();
  recordedSteps.push({ 
    timestamp, 
    step: description,
    stepNumber: stepCounter,
    locator: locator,
    expectedResult: expectedResult
  });
  saveFormattedSteps();
  console.error("✓ Step " + stepCounter + ": " + description);
}

// Launch browser and set up event listeners
async function launchBrowserWithCapture() {
  try {
    console.error("\n🚀 Launching browser with interaction capture...");
    
    // Use persistent context for better trust (keeps cookies, cache, etc.)
    const userDataDir = path.join(process.cwd(), 'Output', 'browser-profile');
    
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: null,
      args: [
        '--start-maximized',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--allow-running-insecure-content',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--disable-extensions-except',
        '--disable-extensions'
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      permissions: ['geolocation', 'notifications'],
      locale: 'en-US',
      timezoneId: 'America/New_York',
      bypassCSP: true
    });
    
    // Get the first page (persistent context opens with one page)
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    
    // Comprehensive bot detection evasion
    await page.addInitScript(() => {
      // Override webdriver flag
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Override chrome runtime
      (window as any).chrome = {
        runtime: {},
      };
      
      // Override permissions
      const originalQuery = (window as any).navigator.permissions.query;
      (window as any).navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: 'granted' as PermissionState }) :
          originalQuery(parameters)
      );
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
    
    recordInteraction("Browser launched successfully", "", "Browser should open");

    // Navigate to Google
    await page.goto("http://google.com");
    recordInteraction("Navigated to http://google.com", "", "Page should load successfully");

    // Set up navigation listener
    page.on('framenavigated', async (frame) => {
      if (frame === page!.mainFrame()) {
        const url = frame.url();
        if (!url.includes('about:blank') && !url.includes('google.com/')) {
          recordInteraction("Navigated to " + url, "", "Page should load successfully");
        }
      }
    });

    // Track input fields using blur events to capture complete text
    const trackedInputs = new Map<string, string>();
    
    // Inject blur event listeners to capture complete input values
    await page.addInitScript(() => {
      // Helper function to generate relative XPath
      function getXPath(element: Element): string {
        const el = element as HTMLElement;
        
        // Priority 1: Use ID if available
        if (el.id) {
          return `//*[@id="${el.id}"]`;
        }
        
        // Priority 2: Use name attribute (common for inputs)
        if (el.getAttribute('name')) {
          return `//${el.tagName.toLowerCase()}[@name="${el.getAttribute('name')}"]`;
        }
        
        // Priority 3: Use type and placeholder for inputs
        if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea') {
          const type = el.getAttribute('type');
          const placeholder = el.getAttribute('placeholder');
          const ariaLabel = el.getAttribute('aria-label');
          
          if (type && placeholder) {
            return `//${el.tagName.toLowerCase()}[@type="${type}" and @placeholder="${placeholder}"]`;
          }
          if (placeholder) {
            return `//${el.tagName.toLowerCase()}[@placeholder="${placeholder}"]`;
          }
          if (ariaLabel) {
            return `//${el.tagName.toLowerCase()}[@aria-label="${ariaLabel}"]`;
          }
          if (type) {
            return `//${el.tagName.toLowerCase()}[@type="${type}"]`;
          }
        }
        
        // Priority 4: Use class if available (first class only)
        if (el.className && typeof el.className === 'string') {
          const firstClass = el.className.split(' ')[0];
          if (firstClass) {
            return `//${el.tagName.toLowerCase()}[@class="${firstClass}"]`;
          }
        }
        
        // Priority 5: Use tag with index
        let ix = 1;
        const siblings = element.parentNode?.children;
        if (siblings) {
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {
              return `//${el.tagName.toLowerCase()}[${ix}]`;
            }
            if (sibling.tagName === element.tagName) {
              ix++;
            }
          }
        }
        
        return `//${el.tagName.toLowerCase()}`;
      }

      // Track initial values to detect changes
      const initialValues = new Map<Element, string>();
      const typingTimers = new Map<Element, number>();

      // Listen for focus events to track initial values
      document.addEventListener('focus', (e) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          const inputType = (input.getAttribute('type') || 'text').toLowerCase();
          
          // Skip non-text inputs
          const skipTypes = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
          
          if (!skipTypes.includes(inputType)) {
            // Only set initial value if not already set
            if (!initialValues.has(input)) {
              initialValues.set(input, input.value);
            }
          }
        }
      }, true);

      // Function to record input value
      function recordInputValue(input: HTMLInputElement | HTMLTextAreaElement, immediate: boolean = false) {
        // Ensure we have an initial value set
        if (!initialValues.has(input)) {
          initialValues.set(input, '');
        }
        
        const currentValue = input.value.trim();
        const initialValue = initialValues.get(input) || '';
        
        // Clear any existing timer for this input
        const existingTimer = typingTimers.get(input);
        if (existingTimer) {
          clearTimeout(existingTimer);
          typingTimers.delete(input);
        }
        
        // Only record if value is not empty and changed from initial
        if (currentValue && currentValue !== initialValue) {
          if (immediate) {
            const fieldName = input.name || input.id || input.placeholder || input.getAttribute('aria-label') || 'input field';
            const xpath = getXPath(input);
            console.log('INPUT_COMPLETE:' + fieldName + '|' + currentValue + '|' + xpath);
            initialValues.set(input, currentValue);
          } else {
            // Wait 1.5 seconds after last keystroke before recording
            const timer = window.setTimeout(() => {
              const finalValue = input.value.trim();
              const lastInitialValue = initialValues.get(input) || '';
              if (finalValue && finalValue !== lastInitialValue) {
                const fieldName = input.name || input.id || input.placeholder || input.getAttribute('aria-label') || 'input field';
                const xpath = getXPath(input);
                console.log('INPUT_COMPLETE:' + fieldName + '|' + finalValue + '|' + xpath);
                initialValues.set(input, finalValue);
              }
              typingTimers.delete(input);
            }, 1500);
            typingTimers.set(input, timer);
          }
        }
      }

      // Listen for input events (typing) with debounce
      document.addEventListener('input', (e) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          const inputType = (input.getAttribute('type') || 'text').toLowerCase();
          
          // Skip non-text inputs like checkbox, radio, file, etc.
          const skipTypes = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
          
          if (!skipTypes.includes(inputType)) {
            recordInputValue(input, false);
          }
        }
      }, true);

      // Listen for blur events to capture complete values immediately
      document.addEventListener('blur', (e) => {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          const input = target as HTMLInputElement | HTMLTextAreaElement;
          const inputType = (input.getAttribute('type') || 'text').toLowerCase();
          
          // Skip non-text inputs
          const skipTypes = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
          
          if (!skipTypes.includes(inputType)) {
            recordInputValue(input, true);
          }
        }
      }, true);

      // Listen for Enter key to capture values immediately when submitting
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const target = e.target as HTMLElement;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
            const input = target as HTMLInputElement | HTMLTextAreaElement;
            const inputType = (input.getAttribute('type') || 'text').toLowerCase();
            
            // Skip non-text inputs
            const skipTypes = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
            
            if (!skipTypes.includes(inputType)) {
              recordInputValue(input, true);
            }
          }
        }
      }, true);
    });

    // Track complete input values via console messages
    page.on('console', async (msg) => {
      const text = msg.text();
      if (text.startsWith('INPUT_COMPLETE:')) {
        const parts = text.substring(15).split('|');
        const fieldName = parts[0] || 'input field';
        const value = parts[1] || '';
        const xpath = parts[2] || '';
        const key = fieldName + xpath;
        
        // Only record if we haven't already recorded this exact value
        if (trackedInputs.get(key) !== value) {
          trackedInputs.set(key, value);
          recordInteraction(
            `Entered "${value}" into ${fieldName}`,
            xpath,
            `Field should contain "${value}"`
          );
        }
      } else if (text.startsWith('CLICK:')) {
        const parts = text.substring(6).split('|');
        const xpath = parts[2] || '';
        const elementText = parts[1] || 'element';
        recordInteraction(
          `Clicked on "${elementText}"`,
          xpath,
          `Element should be clickable`
        );
      }
    });

    // Inject click tracking via console with XPath
    await page.addInitScript(() => {
      // Helper function to generate relative XPath
      function getXPath(element: Element): string {
        const el = element as HTMLElement;
        
        // Priority 1: Use ID if available
        if (el.id) {
          return `//*[@id="${el.id}"]`;
        }
        
        // Priority 2: Use name attribute
        if (el.getAttribute('name')) {
          return `//${el.tagName.toLowerCase()}[@name="${el.getAttribute('name')}"]`;
        }
        
        // Priority 3: Use text content for buttons, links, labels
        if (['button', 'a', 'label', 'span'].includes(el.tagName.toLowerCase())) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text.length <= 30) {
            return `//${el.tagName.toLowerCase()}[text()="${text}"]`;
          }
        }
        
        // Priority 4: Use aria-label
        if (el.getAttribute('aria-label')) {
          return `//${el.tagName.toLowerCase()}[@aria-label="${el.getAttribute('aria-label')}"]`;
        }
        
        // Priority 5: Use title attribute
        if (el.getAttribute('title')) {
          return `//${el.tagName.toLowerCase()}[@title="${el.getAttribute('title')}"]`;
        }
        
        // Priority 6: Use type attribute (for inputs, buttons)
        if (el.getAttribute('type')) {
          return `//${el.tagName.toLowerCase()}[@type="${el.getAttribute('type')}"]`;
        }
        
        // Priority 7: Use class if available (first class only)
        if (el.className && typeof el.className === 'string') {
          const firstClass = el.className.split(' ')[0];
          if (firstClass) {
            return `//${el.tagName.toLowerCase()}[@class="${firstClass}"]`;
          }
        }
        
        // Priority 8: Use tag with index
        let ix = 1;
        const siblings = element.parentNode?.children;
        if (siblings) {
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {
              return `//${el.tagName.toLowerCase()}[${ix}]`;
            }
            if (sibling.tagName === element.tagName) {
              ix++;
            }
          }
        }
        
        return `//${el.tagName.toLowerCase()}`;
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const text = target.textContent?.trim().substring(0, 50) || target.getAttribute('aria-label') || target.getAttribute('title') || '';
        const xpath = getXPath(target);
        const selector = tagName + (target.id ? '#' + target.id : '') + (target.className ? '.' + target.className.split(' ')[0] : '');
        console.log('CLICK:' + selector + '|' + text + '|' + xpath);
      }, true);
    });

    console.error("✓ Browser capture activated!");
    console.error("✓ All interactions will be recorded to: " + STEPS_FILE);
    console.error("\n👉 Use the browser - all your actions will be captured!\n");

  } catch (error) {
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
          note: { type: "string", description: "Note to add" },
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
      const note = (args as any).note;
      recordInteraction("Note: " + note, "", "");
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
  if (page) await page.close();
  if (context) await context.close();
  console.error("✓ Browser closed");
  console.error("✓ All interactions saved to: " + STEPS_FILE);
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
