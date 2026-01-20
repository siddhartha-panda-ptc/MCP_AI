# Step Recorder MCP Server

An MCP (Model Context Protocol) server that automatically launches a browser and captures real-time user interactions. All browser actions (clicks, typing, navigation, scrolling, etc.) are recorded in English with step numbers and saved to formatted text files.

## Features

### ✨ Auto Browser Capture Mode (NEW!)

**Automatically launches browser and captures ALL real user interactions:**

- 🚀 **Auto-launch** - Browser opens with Google.com when server starts
- 🎯 **Live capture** - Records every click, type, hover, scroll, navigation
- 📝 **English descriptions** - Each action documented in clear English with step numbers
- 💾 **Auto-save** - Real-time saving to formatted text file
- 🔇 **Silent mode** - No permission prompts, fully automatic capture
- ✅ **Real interactions only** - Captures actual user actions, not simulated steps

### Captured Interactions

- **Clicks** - Element clicks with selector and text
- **Text Input** - Keyboard input with field names and values
- **Navigation** - Page navigations with URLs
- **Hover** - Mouse hover over interactive elements
- **Scroll** - Scroll events with direction and amount
- **All automatically recorded in real-time!**

### Tools Available

- **get_steps** - Retrieve all captured browser interactions
- **clear_steps** - Clear all captured interactions
- **record_manual_note** - Add manual notes to the recording

### Resources

- **interactions://live** - Live view of all captured browser interactions

### File Output

- `browser-interactions.txt` - Beautifully formatted file with:
  - Session timestamp
  - Total interaction count
  - Each step numbered with English description
  - Timestamp for each action
  - Session summary

## Example Agents

This project includes example agents that demonstrate how to use the Step Recorder MCP:

- **Task Agent** (`examples/task-agent.ts`) - Sequential task execution with step recording
- **Browser Automation Agent** (`examples/browser-agent.ts`) - Browser automation with comprehensive step tracking
- **Quick Start** (`examples/quick-start.js`) - Minimal example showing the concept

Run the examples:
```bash
npx playwright install chromium
npm run example:quick     # Quick start demo
npm run agent:task        # Task agent demo
npm run agent:browser     # Browser automation agent demo
```

See [examples/README.md](examples/README.md) for detailed documentation on the agents.

## Installation

```bash
npm install
npm run build
```
Quick Start

### 🚀 Start Browser Capture Mode

**Option 1: Direct run**
```bash
node build/browser-capture-index.js
```

**Option 2: Use the batch file (Windows)**
```bash
start-browser-capture.bat
```

**What happens:**
1. ✅ MCP server starts
2. ✅ Browser launches automatically with Google.com
3. ✅ All your browser interactions are captured in real-time
4. ✅ Steps saved to `browser-interactions.txt`

### 🎯 Use the Browser

Once started, simply use the browser normally:
- Click anywhere → Captured
- Type text → Captured  
- Navigate pages → Captured
- Scroll → Captured
- Hover over elements → Captured

**All actions automatically recorded with no prompts!**

### 🛑 Stop Recording

Press `Ctrl+C` in the terminal to stop the server and close the browser. All captured interactions remain in the file.

## Configuration for MCP Clients

### With Claude Desktop

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
Server starts** - MCP server initializes and launches Chromium browser
2. **Browser opens** - Automatically navigates to http://google.com
3. **Event listeners activated** - JavaScript injected to capture all user interactions
4. **Real-time capture** - Every action triggers event handlers that record to file
5. **Auto-save** - Each interaction immediately saved to `browser-interactions.txt`
6. **No interruptions** - Silent capture mode, no permission prompts

### Technical Details

The server uses Playwright to:
- Launch headless=false Chromium browser
- Inject client-side event listeners via `page.addInitScript()`
- Expose functions (`recordClick`, `recordInput`, etc.) to capture events
- Track navigation, clicks, input, hover, and scroll events
- Format and save interactions in real-time
      "command": "node",
      "args": ["C:\\mcp\\build\\browser-capture-index.js"]
    }
  }
}
```

### With VS Code

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "step-recorder": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\mcp\\build\\browser-capture-
      "args": ["C:\\mcp\\build\\index.js"]
    }
  }
}
```Output

### Sample `browser-interactions.txt`:

```
═══════════════════════════════════════════════════════
        LIVE BROWSER INTERACTIONS CAPTURED
═══════════════════════════════════════════════════════

Session Started: 2026-01-20T10:30:00.000Z
Total Interactions: 8

───────────────────────────────────────────────────────

Step 1: Browser launched successfully
   Time: 10:30:00 AM

Step 2: Navigated to http://google.com
   Time: 10:30:01 AM

Step 3: Clicked on "textarea#APjFqb" (Search)
   Time: 10:30:15 AM

Step 4: Entered "playwright automation" into textarea
   Time: 10:30:18 AM

Step 5: Clicked on "input (Google Search)"
   Time: 10:30:20 AM

Step 6: Navigated to https://www.google.com/search?q=playwright...
   Time: 10:30:21 AM

StepMCP Tool Usage

```javascript
// Get all captured interactions
const result = await client.request({
  method: "tools/call",
  params: {
    name: "get_steps",
    arguments: {}
  }
});
// Returns: List of all captured browser interactions

// Clear captured interactions
await client.request({
  method: "tools/call",
  params: {
    name: "clear_steps",
    arguments: {}
  }
});
// Clears all recorded interactions

// Add a manual note
await client.request({
  method: "tools/call",
  params: {
    name: "record_manual_note",
    arguments: { note: "Starting checkout flow test" }
  }
});
// Adds custom note to the recording
User: I need to record my browser interactions
AI: I'll record the browser operations for you.

[User clicks on login button]
AI: [Calls record_browser_operation with operation="click", element="login button"]
    Browser operation recorded: Clicked on login button

[User navigates to dashboard]
AI: [Calls record_browser_operation with operation="navigate", url="https://example.com/dashboard"]
    Browser operation recorded: Navigated to https://example.com/dashboard

[User enters username]
AI: [Calls record_browser_operation with operation="type", element="username field", value="john@example.com"]
    Browser operation recorded: Entered "john@example.com" into username field

User: Show me all recorded steps
AI: [Calls get_steps]
    Here are all your recorded steps:
    1. [2026-01-20T05:30:00.000Z] Clicked on login button
    2. [2026-01-20T05:30:15.000Z] Navigated to https://example.com/dashboard
    3. [2026-01-20T05:30:30.000Z] Entered "john@example.com" into username field
```

## Development

### Project Structure

```
c:\mcp\
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled JavaScript output
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

### Building

```bash
npm run build
```

This will compile the TypeScript code to JavaScript in the `build/` directory.

## License

MIT
Project Structure

```
c:\mcp\
├── src/
│   ├── browser-capture-index.ts    # Auto browser capture server (NEW!)
│   ├── index.ts                     # Original step recorder
│   └── auto-browser-recorder.ts     # Standalone recorder
├── build/                           # Compiled JavaScript output
├── browser-interactions.txt         # Captured interactions (generated)
├── start-browser-capture.bat        # Quick start script
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Building

```bash
npm run build
```

### Running Different Modes

```bash
# Auto browser capture mode (recommended)
node build/browser-capture-index.js

# Original step recorder
node build/index.js
```Key Benefits

✅ **Zero Setup** - Just start the server, browser launches automatically  
✅ **No Code Required** - Use the browser normally, everything captured  
✅ **Real Interactions** - Captures actual user actions, not simulations  
✅ **English Descriptions** - Clear, numbered steps anyone can understand  
✅ **Silent Mode** - No permission prompts or interruptions  
✅ **Auto-Save** - Real-time file updates, nothing lost  
✅ **Session Tracking** - Full timeline of all interactions  

## Use Cases

- 🧪 **Manual Testing** - Document test execution steps automatically
- 📝 **Bug Reports** - Provide detailed reproduction steps
- 📚 **Documentation** - Create user guides from real usage
- 🎓 **Training** - Record workflows for training materials  
- 🔍 **Analysis** - Understand user behavior patterns
- ✅ **QA Validation** - Verify feature usage and flows

## Troubleshooting

**Browser doesn't open:**
```bash
npx playwright install chromium
```

**Port already in use:**
- Stop any other MCP servers running
- Check terminal for the running process

**Interactions not captured:**
- Ensure browser window has focus
- Check `browser-interactions.txt` is writable
- Verify server console shows "Browser capture activated!"

## 