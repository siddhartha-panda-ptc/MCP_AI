@echo off
echo ================================================================
echo   E2E Playback MCP - Auto Browser Capture
echo ================================================================
echo.
echo Building project...
call npm run build
echo.
echo Starting MCP server with auto browser capture...
echo Browser will launch automatically with Google.com
echo All your interactions will be recorded!
echo.
echo Press Ctrl+C to stop recording and close browser
echo ================================================================
echo.
node build/browser-capture-index.js
