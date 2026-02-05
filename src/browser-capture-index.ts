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

// HTML escape helper function
function escapeHtml(text: string): string {
  const htmlEntities: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return text.replace(/[&<>"']/g, char => htmlEntities[char]);
}

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

// Launch browser for execution only (no recording setup)
async function launchBrowserForExecution() {
  try {
    console.error("\n🚀 Launching browser for execution...");
    
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
    
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
    
    // Bot detection evasion
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      (window as any).chrome = { runtime: {} };
    });
    
    console.error("✓ Browser ready for execution");
    
  } catch (error) {
    console.error("Error launching browser for execution:", error);
    throw error;
  }
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

    // Track input fields - set up BEFORE navigation
    const trackedInputs = new Map<string, string>();
    let trackerLoaded = false;
    
    // Define the tracker script as a function we can reuse
    const trackerScript = `
      console.log('INPUT_TRACKER_LOADED');
      
      // Override HTMLInputElement and HTMLTextAreaElement value setters to capture programmatic fills
      const originalInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const originalInputValueGetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').get;
      const originalTextAreaValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      const originalTextAreaValueGetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').get;
      
      Object.defineProperty(HTMLInputElement.prototype, 'value', {
        set: function(newValue) {
          const oldValue = originalInputValueGetter.call(this);
          originalInputValueSetter.call(this, newValue);
          if (oldValue !== newValue) {
            const event = new Event('input', { bubbles: true, cancelable: true });
            this.dispatchEvent(event);
            console.log('PROGRAMMATIC_FILL_DETECTED: INPUT value changed to', newValue);
          }
        },
        get: function() {
          return originalInputValueGetter.call(this);
        }
      });
      
      Object.defineProperty(HTMLTextAreaElement.prototype, 'value', {
        set: function(newValue) {
          const oldValue = originalTextAreaValueGetter.call(this);
          originalTextAreaValueSetter.call(this, newValue);
          if (oldValue !== newValue) {
            const event = new Event('input', { bubbles: true, cancelable: true });
            this.dispatchEvent(event);
            console.log('PROGRAMMATIC_FILL_DETECTED: TEXTAREA value changed to', newValue);
          }
        },
        get: function() {
          return originalTextAreaValueGetter.call(this);
        }
      });
      
      function getXPath(element) {
        const el = element;
        if (el.id) return "//*[@id=\\"" + el.id + "\\"]";
        if (el.getAttribute('name')) return "//" + el.tagName.toLowerCase() + "[@name=\\"" + el.getAttribute('name') + "\\"]";
        if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'textarea') {
          const type = el.getAttribute('type');
          const placeholder = el.getAttribute('placeholder');
          const ariaLabel = el.getAttribute('aria-label');
          if (type && placeholder) return "//" + el.tagName.toLowerCase() + "[@type=\\"" + type + "\\" and @placeholder=\\"" + placeholder + "\\"]";
          if (placeholder) return "//" + el.tagName.toLowerCase() + "[@placeholder=\\"" + placeholder + "\\"]";
          if (ariaLabel) return "//" + el.tagName.toLowerCase() + "[@aria-label=\\"" + ariaLabel + "\\"]";
          if (type) return "//" + el.tagName.toLowerCase() + "[@type=\\"" + type + "\\"]";
        }
        if (el.className && typeof el.className === 'string') {
          const firstClass = el.className.split(' ')[0];
          if (firstClass) return "//" + el.tagName.toLowerCase() + "[@class=\\"" + firstClass + "\\"]";
        }
        let ix = 1;
        const siblings = element.parentNode?.children;
        if (siblings) {
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) return "//" + el.tagName.toLowerCase() + "[" + ix + "]";
            if (sibling.tagName === element.tagName) ix++;
          }
        }
        return "//" + el.tagName.toLowerCase();
      }

      const recordedValues = new Map();

      function logInputComplete(input, eventType) {
        const value = input.value.trim();
        const lastValue = recordedValues.get(input) || '';
        if (value && value !== lastValue) {
          const fieldName = input.name || input.id || input.placeholder || input.getAttribute('aria-label') || 'input field';
          const xpath = getXPath(input);
          console.log('INPUT_COMPLETE:' + fieldName + '|' + value + '|' + xpath);
          recordedValues.set(input, value);
        }
      }

      document.addEventListener('blur', (e) => {
        const target = e.target;
        const tagName = target?.tagName;
        if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
          const input = target;
          const type = (input.getAttribute('type') || 'text').toLowerCase();
          const skipTypes = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
          if (tagName === 'TEXTAREA' || !skipTypes.includes(type)) {
            logInputComplete(input, 'blur');
          }
        }
      }, true);

      document.addEventListener('change', (e) => {
        const target = e.target;
        const tagName = target?.tagName;
        if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
          const input = target;
          const type = (input.getAttribute('type') || 'text').toLowerCase();
          const skipTypes = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
          if (tagName === 'TEXTAREA' || !skipTypes.includes(type)) {
            logInputComplete(input, 'change');
          }
        }
      }, true);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const target = e.target;
          const tagName = target?.tagName;
          if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
            const input = target;
            const type = (input.getAttribute('type') || 'text').toLowerCase();
            const skipTypes = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'hidden', 'range', 'color', 'date', 'datetime-local', 'month', 'time', 'week'];
            if (tagName === 'TEXTAREA' || !skipTypes.includes(type)) {
              logInputComplete(input, 'enter');
            }
          }
        }
      }, true);

      function getClickXPath(element) {
        const el = element;
        if (el.id) return "//*[@id=\\"" + el.id + "\\"]";
        if (el.getAttribute('name')) return "//" + el.tagName.toLowerCase() + "[@name=\\"" + el.getAttribute('name') + "\\"]";
        if (['button', 'a', 'label', 'span'].includes(el.tagName.toLowerCase())) {
          const text = el.textContent?.trim();
          if (text && text.length > 0 && text.length <= 30) return "//" + el.tagName.toLowerCase() + "[text()=\\"" + text + "\\"]";
        }
        if (el.getAttribute('aria-label')) return "//" + el.tagName.toLowerCase() + "[@aria-label=\\"" + el.getAttribute('aria-label') + "\\"]";
        if (el.getAttribute('title')) return "//" + el.tagName.toLowerCase() + "[@title=\\"" + el.getAttribute('title') + "\\"]";
        if (el.getAttribute('type')) return "//" + el.tagName.toLowerCase() + "[@type=\\"" + el.getAttribute('type') + "\\"]";
        if (el.className && typeof el.className === 'string') {
          const firstClass = el.className.split(' ')[0];
          if (firstClass) return "//" + el.tagName.toLowerCase() + "[@class=\\"" + firstClass + "\\"]";
        }
        let ix = 1;
        const siblings = element.parentNode?.children;
        if (siblings) {
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) return "//" + el.tagName.toLowerCase() + "[" + ix + "]";
            if (sibling.tagName === element.tagName) ix++;
          }
        }
        return "//" + el.tagName.toLowerCase();
      }

      document.addEventListener('click', (e) => {
        const target = e.target;
        const tagName = target.tagName.toLowerCase();
        const text = target.textContent?.trim().substring(0, 50) || target.getAttribute('aria-label') || target.getAttribute('title') || '';
        const xpath = getClickXPath(target);
        const selector = tagName + (target.id ? '#' + target.id : '') + (target.className ? '.' + target.className.split(' ')[0] : '');
        console.log('CLICK:' + selector + '|' + text + '|' + xpath);
      }, true);
    `;
    
    // Set up console listener BEFORE navigation
    page.on('console', async (msg) => {
      const text = msg.text();
      
      // Track when input tracker loads
      if (text === 'INPUT_TRACKER_LOADED') {
        trackerLoaded = true;
        console.error('✓ Input tracking system loaded');
        return;
      }
      
      // Debug: log all console messages to see what's happening
      if (text.startsWith('INPUT_') || text.startsWith('BLUR_') || text.startsWith('CHANGE_') || text.startsWith('ENTER_') || text.startsWith('PROGRAMMATIC_')) {
        console.error('[DEBUG] Console message:', text);
      }
      
      if (text.startsWith('INPUT_COMPLETE:')) {
        const parts = text.substring(15).split('|');
        const fieldName = parts[0] || 'input field';
        const value = parts[1] || '';
        const xpath = parts[2] || '';
        const key = fieldName + ':' + xpath;
        
        // Always record if value is different from last recorded (allow multiple updates to same field)
        const lastRecorded = trackedInputs.get(key);
        if (value && value !== lastRecorded) {
          trackedInputs.set(key, value);
          recordInteraction(
            `Entered "${value}" into ${fieldName}`,
            xpath,
            `Field should contain "${value}"`
          );
          console.error(`✓ Captured input: "${value}" in ${fieldName}`);
        } else if (value) {
          console.error(`[SKIP] Duplicate value for ${fieldName}: "${value}"`);
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
        console.error(`✓ Captured click: "${elementText}"`);
      }
    });

    // Set up navigation listener
    page.on('framenavigated', async (frame) => {
      if (frame === page!.mainFrame()) {
        const url = frame.url();
        if (!url.includes('about:blank') && !url.includes('localhost:8080/cb/')) {
          recordInteraction("Navigated to " + url, "", "Page should load successfully");
        }
      }
    });

    // Navigate to localhost
    await page.goto("http://localhost:8080/cb/", { waitUntil: 'domcontentloaded' });
    recordInteraction("Navigated to http://localhost:8080/cb/", "", "Page should load successfully");
    
    // Inject tracker script into the current page immediately
    await page.evaluate(trackerScript);
    
    // Also add as init script for future navigations
    await page.addInitScript(trackerScript);
    
    // Listen for new pages/tabs being opened
    context.on('page', async (newPage) => {
      const url = newPage.url();
      recordInteraction(`New tab/window opened: ${url || 'about:blank'}`, "", "New tab should open");
      console.error(`✓ Captured new tab: ${url || 'about:blank'}`);
      
      // Set up tracking on the new page
      await newPage.waitForLoadState('domcontentloaded').catch(() => {});
      await newPage.evaluate(trackerScript).catch(() => {});
      
      // Set up console listener for the new page
      newPage.on('console', async (msg) => {
        const text = msg.text();
        
        if (text === 'INPUT_TRACKER_LOADED') {
          console.error('✓ Input tracking loaded in new tab');
          return;
        }
        
        if (text.startsWith('INPUT_') || text.startsWith('BLUR_') || text.startsWith('CHANGE_') || text.startsWith('ENTER_') || text.startsWith('PROGRAMMATIC_')) {
          console.error('[DEBUG] New tab console:', text);
        }
        
        if (text.startsWith('INPUT_COMPLETE:')) {
          const parts = text.substring(15).split('|');
          const fieldName = parts[0] || 'input field';
          const value = parts[1] || '';
          const xpath = parts[2] || '';
          const key = fieldName + ':' + xpath;
          
          const lastRecorded = trackedInputs.get(key);
          if (value && value !== lastRecorded) {
            trackedInputs.set(key, value);
            recordInteraction(
              `Entered "${value}" into ${fieldName}`,
              xpath,
              `Field should contain "${value}"`
            );
            console.error(`✓ Captured input in new tab: "${value}" in ${fieldName}`);
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
          console.error(`✓ Captured click in new tab: "${elementText}"`);
        }
      });
    });
    
    // Wait a moment for tracker to confirm
    await page.waitForTimeout(500);
    if (trackerLoaded) {
      console.error('✓ Ready to capture interactions');
    } else {
      console.error('⚠ Warning: Input tracker may not have loaded');
    }

    console.error("✓ Browser capture activated!");
    console.error("✓ All interactions will be recorded to: " + STEPS_FILE);
    console.error("\n👉 Use the browser - all your actions will be captured!\n");

    // Monitor browser close event
    context.on('close', () => {
      console.error("\n" + "=".repeat(60));
      console.error("Browser closed - Recording stopped");
      console.error("=".repeat(60));
      console.error("✓ All interactions saved to: " + STEPS_FILE);
      console.error("Total steps recorded: " + recordedSteps.length);
      console.error("=".repeat(60) + "\n");
      
      // Clear the context and page references
      page = null;
      context = null;
    });

    page.on('close', () => {
      console.error("Main page closed");
    });

  } catch (error) {
    console.error("Error launching browser:", error);
  }
}

// Create MCP server
const server = new McpServer({
  name: "e2e-playback-with-browser",
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
    {
      name: "execute_steps",
      description: "Execute/replay captured steps from the Excel file (codeless execution)",
      inputSchema: {
        type: "object",
        properties: {
          filePath: { 
            type: "string", 
            description: "Optional: Path to Excel file with steps. If not provided, uses the latest captured steps file." 
          },
        },
      },
    },
    {
      name: "record",
      description: "Launch browser and start recording user interactions",
      inputSchema: {
        type: "object",
        properties: {},
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

    case "execute_steps": {
      try {
        const filePathArg = (args as any)?.filePath;
        const excelPath = filePathArg || STEPS_FILE;
        
        if (!fs.existsSync(excelPath)) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Steps file not found at " + excelPath,
              },
            ],
          };
        }

        // Check if browser is available, if not launch one
        if (!page || !context) {
          console.error("Browser not running, launching for execution...");
          await launchBrowserForExecution();
        }

        // Check if page is still active, if not relaunch
        try {
          await page!.title();
        } catch (e) {
          console.error("Browser page closed, relaunching for execution...");
          await launchBrowserForExecution();
        }

        // Read Excel file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(excelPath);
        const worksheet = workbook.getWorksheet('Test Steps');
        
        if (!worksheet) {
          return {
            content: [
              {
                type: "text",
                text: "Error: 'Test Steps' worksheet not found in file",
              },
            ],
          };
        }

        const executionResults: string[] = [];
        let successCount = 0;
        let failCount = 0;
        
        // Detailed results for report
        interface StepResult {
          stepNum: string;
          action: string;
          locator: string;
          status: 'Passed' | 'Failed' | 'Skipped' | 'Info';
          errorMessage: string;
          startTime: string;
          endTime: string;
          duration: number;
        }
        const detailedResults: StepResult[] = [];
        const executionStartTime = new Date();

        console.error("\n" + "=".repeat(60));
        console.error("Starting Codeless Execution");
        console.error("=".repeat(60));

        // Execute each step
        for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
          const row = worksheet.getRow(rowNum);
          const stepNum = row.getCell(1).value?.toString() || '';
          const actualStep = row.getCell(2).value?.toString() || '';
          const locator = row.getCell(3).value?.toString() || '';
          
          if (!actualStep) continue;

          const stepStartTime = new Date();
          let stepStatus: 'Passed' | 'Failed' | 'Skipped' | 'Info' = 'Passed';
          let errorMessage = '';

          try {
            console.error(`\n▶ Executing Step ${stepNum}: ${actualStep}`);

            // Parse and execute the step
            if (actualStep.includes('Navigated to ')) {
              const url = actualStep.replace('Navigated to ', '');
              await page!.goto(url, { waitUntil: 'domcontentloaded' });
              executionResults.push(`✓ Step ${stepNum}: Navigated to ${url}`);
              successCount++;
              stepStatus = 'Passed';
            } 
            else if (actualStep.includes('Clicked on ')) {
              if (locator) {
                await page!.locator(locator).first().click({ timeout: 5000 });
                executionResults.push(`✓ Step ${stepNum}: ${actualStep}`);
                successCount++;
                stepStatus = 'Passed';
              } else {
                executionResults.push(`⚠ Step ${stepNum}: Skipped - No locator`);
                stepStatus = 'Skipped';
                errorMessage = 'No locator provided';
              }
            }
            else if (actualStep.includes('Entered "') && actualStep.includes('" into ')) {
              const match = actualStep.match(/Entered "(.+)" into (.+)/);
              if (match && locator) {
                const value = match[1];
                await page!.locator(locator).first().fill(value, { timeout: 5000 });
                executionResults.push(`✓ Step ${stepNum}: Entered "${value}"`);
                successCount++;
                stepStatus = 'Passed';
              } else {
                executionResults.push(`⚠ Step ${stepNum}: Skipped - No locator`);
                stepStatus = 'Skipped';
                errorMessage = 'No locator provided';
              }
            }
            else if (actualStep.includes('New tab/window opened:')) {
              const url = actualStep.replace('New tab/window opened: ', '');
              // Wait for new page
              const newPagePromise = context!.waitForEvent('page');
              const newPage = await newPagePromise;
              await newPage.waitForLoadState('domcontentloaded');
              executionResults.push(`✓ Step ${stepNum}: New tab opened - ${url}`);
              successCount++;
              stepStatus = 'Passed';
            }
            else if (actualStep.includes('Browser launched') || actualStep.includes('Note:')) {
              executionResults.push(`ℹ Step ${stepNum}: ${actualStep} (info only)`);
              stepStatus = 'Info';
            }
            else {
              executionResults.push(`⚠ Step ${stepNum}: Unsupported step type - ${actualStep}`);
              stepStatus = 'Skipped';
              errorMessage = 'Unsupported step type';
            }

            // Small delay between steps
            await page!.waitForTimeout(500);

          } catch (error: any) {
            errorMessage = error.message || String(error);
            executionResults.push(`✗ Step ${stepNum}: Failed - ${errorMessage}`);
            failCount++;
            stepStatus = 'Failed';
            console.error(`✗ Step ${stepNum} failed:`, errorMessage);
          }

          const stepEndTime = new Date();
          detailedResults.push({
            stepNum,
            action: actualStep,
            locator,
            status: stepStatus,
            errorMessage,
            startTime: stepStartTime.toISOString(),
            endTime: stepEndTime.toISOString(),
            duration: stepEndTime.getTime() - stepStartTime.getTime()
          });
        }

        const executionEndTime = new Date();
        const totalDuration = executionEndTime.getTime() - executionStartTime.getTime();

        // Save detailed HTML report to Results folder
        const resultsDir = path.join('c:\\mcp', 'Results');
        if (!fs.existsSync(resultsDir)) {
          fs.mkdirSync(resultsDir, { recursive: true });
        }

        // Format timestamp for filename
        const timestamp = new Date();
        const dateStr = timestamp.toLocaleDateString('en-GB').replace(/\//g, '-');
        const timeStr = timestamp.toLocaleTimeString('en-GB', { hour12: false }).replace(/:/g, '-');
        const reportFileName = `ExecutionReport_${dateStr}_${timeStr}.html`;
        const reportPath = path.join(resultsDir, reportFileName);

        const passedCount = detailedResults.filter(r => r.status === 'Passed').length;
        const failedCount = detailedResults.filter(r => r.status === 'Failed').length;
        const skippedCount = detailedResults.filter(r => r.status === 'Skipped').length;
        const infoCount = detailedResults.filter(r => r.status === 'Info').length;
        const executableSteps = detailedResults.length - infoCount;
        const passRate = executableSteps > 0 ? ((passedCount / executableSteps) * 100).toFixed(1) : '0';
        const overallStatus = failedCount === 0 ? 'PASSED' : 'FAILED';

        // Generate HTML report
        const htmlReport = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E2E Playback Execution Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f7fa; color: #333; line-height: 1.6; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3); }
        .header h1 { font-size: 28px; margin-bottom: 5px; }
        .header .subtitle { opacity: 0.9; font-size: 14px; }
        .overall-status { display: inline-block; padding: 8px 20px; border-radius: 20px; font-weight: bold; font-size: 18px; margin-top: 15px; }
        .overall-status.passed { background: #10b981; }
        .overall-status.failed { background: #ef4444; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .card h2 { font-size: 16px; color: #666; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
        .stat-item { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 8px; }
        .stat-value { font-size: 32px; font-weight: bold; }
        .stat-value.passed { color: #10b981; }
        .stat-value.failed { color: #ef4444; }
        .stat-value.skipped { color: #f59e0b; }
        .stat-value.info { color: #3b82f6; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 5px; }
        .env-table { width: 100%; }
        .env-table tr td { padding: 10px 0; border-bottom: 1px solid #eee; }
        .env-table tr td:first-child { font-weight: 600; color: #555; width: 40%; }
        .env-table tr:last-child td { border-bottom: none; }
        .progress-bar { height: 12px; background: #e5e7eb; border-radius: 6px; overflow: hidden; margin-top: 15px; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); transition: width 0.5s; }
        .progress-fill.has-failures { background: linear-gradient(90deg, #10b981 0%, #10b981 ${passRate}%, #ef4444 ${passRate}%, #ef4444 100%); }
        .steps-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .steps-table th { background: #4472c4; color: white; padding: 12px 15px; text-align: left; font-weight: 600; font-size: 13px; text-transform: uppercase; }
        .steps-table td { padding: 12px 15px; border-bottom: 1px solid #eee; font-size: 14px; }
        .steps-table tr:hover { background: #f8f9fa; }
        .steps-table .step-num { font-weight: bold; color: #4472c4; }
        .steps-table .action { max-width: 300px; word-wrap: break-word; }
        .steps-table .locator { max-width: 250px; word-wrap: break-word; font-family: monospace; font-size: 12px; color: #666; }
        .steps-table .error { max-width: 200px; word-wrap: break-word; font-size: 12px; color: #ef4444; }
        .status-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
        .status-badge.passed { background: #d1fae5; color: #065f46; }
        .status-badge.failed { background: #fee2e2; color: #991b1b; }
        .status-badge.skipped { background: #fef3c7; color: #92400e; }
        .status-badge.info { background: #dbeafe; color: #1e40af; }
        .time-col { font-size: 12px; color: #666; white-space: nowrap; }
        .duration-col { font-weight: 600; color: #4472c4; }
        .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }
        .donut-chart { width: 150px; height: 150px; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎭 E2E Playback Execution Report</h1>
            <div class="subtitle">Automated Test Execution Results</div>
            <div class="overall-status ${overallStatus.toLowerCase()}">${overallStatus}</div>
        </div>

        <div class="cards">
            <div class="card">
                <h2>📊 Test Results</h2>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value passed">${passedCount}</div>
                        <div class="stat-label">✓ Passed</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value failed">${failedCount}</div>
                        <div class="stat-label">✗ Failed</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value skipped">${skippedCount}</div>
                        <div class="stat-label">⚠ Skipped</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value info">${infoCount}</div>
                        <div class="stat-label">ℹ Info</div>
                    </div>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill ${failedCount > 0 ? 'has-failures' : ''}" style="width: 100%"></div>
                </div>
                <div style="text-align: center; margin-top: 10px; font-size: 14px; color: #666;">
                    Pass Rate: <strong style="color: ${failedCount === 0 ? '#10b981' : '#ef4444'}">${passRate}%</strong>
                </div>
            </div>

            <div class="card">
                <h2>⏱️ Timing Information</h2>
                <table class="env-table">
                    <tr><td>Execution Date</td><td>${executionStartTime.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td></tr>
                    <tr><td>Start Time</td><td>${executionStartTime.toLocaleTimeString('en-GB', { hour12: true })}</td></tr>
                    <tr><td>End Time</td><td>${executionEndTime.toLocaleTimeString('en-GB', { hour12: true })}</td></tr>
                    <tr><td>Total Duration</td><td><strong>${(totalDuration / 1000).toFixed(2)} seconds</strong></td></tr>
                    <tr><td>Avg Step Duration</td><td>${(totalDuration / detailedResults.length / 1000).toFixed(2)} seconds</td></tr>
                </table>
            </div>

            <div class="card">
                <h2>🖥️ Environment</h2>
                <table class="env-table">
                    <tr><td>Test File</td><td style="word-break: break-all; font-size: 12px;">${excelPath}</td></tr>
                    <tr><td>Platform</td><td>${process.platform}</td></tr>
                    <tr><td>Node Version</td><td>${process.version}</td></tr>
                    <tr><td>Architecture</td><td>${process.arch}</td></tr>
                    <tr><td>Browser</td><td>Chromium (Playwright)</td></tr>
                </table>
            </div>
        </div>

        <div class="card">
            <h2>📋 Step-wise Execution Details</h2>
            <table class="steps-table">
                <thead>
                    <tr>
                        <th>Step</th>
                        <th>Action</th>
                        <th>Locator</th>
                        <th>Status</th>
                        <th>Error</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Duration</th>
                    </tr>
                </thead>
                <tbody>
                    ${detailedResults.map(r => `
                    <tr>
                        <td class="step-num">${r.stepNum}</td>
                        <td class="action">${escapeHtml(r.action)}</td>
                        <td class="locator">${escapeHtml(r.locator || '-')}</td>
                        <td><span class="status-badge ${r.status.toLowerCase()}">${r.status}</span></td>
                        <td class="error">${escapeHtml(r.errorMessage || '-')}</td>
                        <td class="time-col">${new Date(r.startTime).toLocaleTimeString('en-GB')}</td>
                        <td class="time-col">${new Date(r.endTime).toLocaleTimeString('en-GB')}</td>
                        <td class="duration-col">${r.duration}ms</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="footer">
            Generated by E2E Playback Server • ${timestamp.toLocaleString('en-GB')}
        </div>
    </div>
</body>
</html>`;

        fs.writeFileSync(reportPath, htmlReport);
        console.error(`\n📊 Detailed HTML report saved: ${reportPath}`);

        // Close browser after execution
        try {
          if (context) {
            await context.close();
            context = null;
            page = null;
            console.error('✓ Browser closed after execution');
          }
        } catch (closeError) {
          console.error('Note: Browser was already closed');
        }

        const summary = `\n${'='.repeat(60)}\nExecution Summary:\n${'='.repeat(60)}\n` +
                       `Total Steps: ${detailedResults.length}\n` +
                       `✓ Passed: ${passedCount}\n` +
                       `✗ Failed: ${failedCount}\n` +
                       `⚠ Skipped: ${skippedCount}\n` +
                       `ℹ Info: ${infoCount}\n` +
                       `Duration: ${(totalDuration / 1000).toFixed(2)} seconds\n` +
                       `${'='.repeat(60)}\n` +
                       `\n📊 Detailed Report: ${reportPath}\n`;

        return {
          content: [
            {
              type: "text",
              text: "Codeless Execution Results:\n\n" + 
                    executionResults.join("\n") + "\n" + summary,
            },
          ],
        };

      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: "Error during execution: " + (error.message || String(error)),
            },
          ],
        };
      }
    }

    case "record": {
      try {
        if (context && page) {
          return {
            content: [
              {
                type: "text",
                text: "Browser is already running and recording interactions.\n\nUse the browser to perform actions - all interactions will be captured automatically.",
              },
            ],
          };
        }

        // Launch browser and start recording
        await launchBrowserWithCapture();
        
        return {
          content: [
            {
              type: "text",
              text: "✓ Browser launched successfully!\n✓ Recording started\n\nAll your interactions will be captured automatically.\nSteps will be saved to: " + STEPS_FILE,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: "Error launching browser: " + (error.message || String(error)),
            },
          ],
        };
      }
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

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("═══════════════════════════════════════════════════════");
  console.error("  E2E Playback MCP - On-Demand Recording Mode");
  console.error("═══════════════════════════════════════════════════════");
  console.error("\nMCP Server ready on stdio");
  console.error("\nTo start recording, use the 'record' tool:");
  console.error("  @mcp record");
  console.error("\nTo execute recorded steps:");
  console.error("  @mcp execute_steps");
  console.error("");
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
