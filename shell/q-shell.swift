// Q's native shell: Q's page in its own window, a menu bar item, and a global
// push-to-talk key (⌥Space, D-033) that works from any app.
// The window has two shapes: compact (a small frameless orb that floats in a
// corner) and full (the whole page). It is one page either way, so the
// conversation carries over (D-032).
//
// It also runs Q's server: if none is answering it starts `node server.js`
// from the Q folder this app sits in (bin/Q.app), and stops it again on quit.
// A server that was already running (npm start) is used and left alone.
//
// Built by `npm run build:shell` into bin/Q.app and started by the launcher
// through `open`, so macOS attributes the microphone request to this app.
// Arguments: a URL to load instead of http://127.0.0.1:4141, and
// --log <file> to record load, microphone and key events with timings.

import AppKit
import Carbon.HIToolbox
import WebKit

let args = Array(CommandLine.arguments.dropFirst())
let pageURL = URL(string: args.first(where: { $0.hasPrefix("http") }) ?? "http://127.0.0.1:4141")!
let logFile: FileHandle? = {
  guard let i = args.firstIndex(of: "--log"), i + 1 < args.count else { return nil }
  FileManager.default.createFile(atPath: args[i + 1], contents: nil)
  return FileHandle(forWritingAtPath: args[i + 1])
}()
let launched = Date()

func log(_ what: String) {
  guard let logFile else { return }
  logFile.write(String(format: "%7.0f ms  %@\n", Date().timeIntervalSince(launched) * 1000, what).data(using: .utf8)!)
}

// bin/Q.app → the Q folder. The app has to stay inside it.
let qFolder = Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
let serverLog = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Q/server.log")
let ollamaURL = URL(string: "http://127.0.0.1:11434/api/version")!
// An app opened from Finder doesn't get the shell's PATH, so look where Node is usually installed.
let toolDirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]

enum Answer { case q, somethingElse, nothing }

// Is Q's server answering on our port? Anything else there is not ours to use.
func askServer(_ done: @escaping (Answer) -> Void) {
  var request = URLRequest(url: pageURL.appendingPathComponent("api/status"))
  request.timeoutInterval = 2
  URLSession.shared.dataTask(with: request) { data, response, _ in
    let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
    let answer: Answer = response == nil ? .nothing : text.contains("\"warmup\"") ? .q : .somethingElse
    DispatchQueue.main.async { done(answer) }
  }.resume()
}

// Shown in the window while there is no page to show: starting up, or why it can't.
func placeholder(_ text: String, problem: Bool) -> String {
  let safe = text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
  return """
  <!doctype html><meta charset="utf-8"><style>
  html, body { height: 100%; margin: 0; background: transparent; }
  body { display: flex; align-items: center; justify-content: center; font: 11px/1.35 -apple-system, sans-serif; color: \(problem ? "#ffb547" : "#9fb3d1"); text-align: center; }
  div { width: 104px; height: 104px; border-radius: 50%; background: rgba(5, 9, 20, 0.94); border: 1px solid rgba(110, 200, 255, 0.25); display: flex; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box; }
  </style><div>\(safe)</div>
  """
}

let compactSize = NSSize(width: 120, height: 120)
let captionWidth: CGFloat = 300 // added beside the orb while a caption is showing
let fullSize = NSSize(width: 440, height: 680)
let cornerMargin: CGFloat = 16

// A frameless window can't take the keyboard unless it says it can.
final class QWindow: NSWindow {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
}

// A web view takes every mouse event, so a frameless window around one can't
// be dragged. In compact mode the mouse is handled here instead: a press that
// moves drags the window, a press that doesn't is a click on the orb.
final class QWebView: WKWebView {
  var compact = false
  var onClick: (() -> Void)?
  var onMoved: (() -> Void)?
  var orbMenu: NSMenu? // the menu bar item's menu, also offered on the orb itself
  private var grab: NSPoint?
  private var moved = false

  // Right-click (or Control-click) the orb for the same menu as the menu bar item, Quit included.
  override func rightMouseDown(with event: NSEvent) {
    guard compact, let orbMenu else { return super.rightMouseDown(with: event) }
    NSMenu.popUpContextMenu(orbMenu, with: event, for: self)
  }

  override func mouseDown(with event: NSEvent) {
    guard compact else { return super.mouseDown(with: event) }
    if event.modifierFlags.contains(.control), let orbMenu { return NSMenu.popUpContextMenu(orbMenu, with: event, for: self) }
    grab = event.locationInWindow
    moved = false
  }

  override func mouseDragged(with event: NSEvent) {
    guard compact, let grab, let window else { return super.mouseDragged(with: event) }
    let now = NSEvent.mouseLocation
    let origin = NSPoint(x: now.x - grab.x, y: now.y - grab.y)
    if !moved && hypot(origin.x - window.frame.origin.x, origin.y - window.frame.origin.y) < 4 { return }
    moved = true
    window.setFrameOrigin(origin)
  }

  override func mouseUp(with event: NSEvent) {
    guard compact else { return super.mouseUp(with: event) }
    if moved { onMoved?() } else if grab != nil { onClick?() }
    grab = nil
  }
}

final class Shell: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
  var window: QWindow!
  var web: QWebView!
  var item: NSStatusItem!
  var modeItem: NSMenuItem!
  var compact = true
  var captionOn = false
  var captionLeft = true // which side of the orb the caption opens on
  let saved = UserDefaults.standard
  var statusLine: NSMenuItem!
  var quitItem: NSMenuItem!
  var server: Process?   // set only when this app started the server
  var pageUp = false     // Q's page is loaded, not the placeholder
  var problem = false    // the placeholder is showing something that needs attention
  var quitting = false
  var waiter: Timer?

  // Where the orb itself is, whether or not the window is widened for a caption.
  var orbFrame: NSRect {
    let f = window.frame
    guard compact && captionOn else { return f }
    return NSRect(x: captionLeft ? f.maxX - compactSize.width : f.minX, y: f.minY, width: compactSize.width, height: compactSize.height)
  }

  func applicationDidFinishLaunching(_ note: Notification) {
    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = [] // Q speaks without a click in this window
    config.userContentController.add(self, name: "q") // the page asks to expand or shrink
    // Start in the right shape before anything is drawn, so the full page never flashes.
    config.userContentController.addUserScript(WKUserScript(source: "document.documentElement.classList.add('compact')", injectionTime: .atDocumentStart, forMainFrameOnly: true))
    web = QWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    web.uiDelegate = self
    web.setValue(false, forKey: "drawsBackground") // see-through around the orb
    web.onClick = { [weak self] in
      guard let self else { return }
      if self.pageUp { self.web.evaluateJavaScript("window.qOrbClick && window.qOrbClick()") }
      else if self.problem { self.showLog() }
    }
    web.onMoved = { [weak self] in self?.rememberFrame() }

    window = QWindow(contentRect: NSRect(origin: .zero, size: compactSize), styleMask: [.borderless], backing: .buffered, defer: false)
    window.title = "Q"
    window.level = .floating
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.contentView = web

    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    item.button?.title = "Q"
    let menu = NSMenu()
    menu.autoenablesItems = false
    statusLine = menu.addItem(withTitle: "Starting…", action: nil, keyEquivalent: "")
    statusLine.isEnabled = false
    menu.addItem(.separator())
    modeItem = menu.addItem(withTitle: "", action: #selector(switchMode), keyEquivalent: "")
    modeItem.target = self
    menu.addItem(withTitle: "Show or hide Q", action: #selector(toggle), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Show server log", action: #selector(showLog), keyEquivalent: "").target = self
    menu.addItem(.separator())
    quitItem = menu.addItem(withTitle: "Quit Q", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
    item.menu = menu
    web.orbMenu = menu

    NSApp.mainMenu = mainMenu()
    apply(compact: true, activate: false)
    registerHotKey()
    log("window up")
    connect()
  }

  // ---------- Q's server ----------

  func say(_ text: String, problem isProblem: Bool = false) {
    log("status: \(text)")
    statusLine.title = text
    problem = isProblem
    if !pageUp { web.loadHTMLString(placeholder(text, problem: isProblem), baseURL: nil) }
  }

  // Use the server that is running, or start one, then load the page once it answers.
  func connect() {
    pageUp = false
    askServer { [weak self] answer in
      guard let self else { return }
      switch answer {
      case .q:
        self.quitItem.title = self.server == nil ? "Quit Q's window (the server keeps running)" : "Quit Q"
        self.loadPage()
      case .somethingElse:
        self.say("Something other than Q is using port \(pageURL.port ?? 80). Quit it, then choose Reload.", problem: true)
      case .nothing:
        if self.server?.isRunning == true { self.waitForServer() } else { self.startServer() }
      }
    }
  }

  func startServer() {
    guard FileManager.default.fileExists(atPath: qFolder.appendingPathComponent("server.js").path) else {
      return say("Q.app has to stay in the Q folder's bin directory (no server.js in \(qFolder.path)).", problem: true)
    }
    guard let node = toolDirs.map({ $0 + "/node" }).first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else {
      return say("Node.js isn't installed. Install Node 20+ from nodejs.org, then choose Reload.", problem: true)
    }
    wakeOllama()
    try? FileManager.default.createDirectory(at: serverLog.deletingLastPathComponent(), withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: serverLog.path, contents: nil) // a fresh log each start
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: node)
    proc.arguments = ["server.js"]
    proc.currentDirectoryURL = qFolder
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = (toolDirs + [env["PATH"] ?? ""]).joined(separator: ":") // the server starts Whisper and the voice helper by name
    env["Q_PORT"] = String(pageURL.port ?? 80)
    env["Q_EXIT_WITH_PARENT"] = "1"
    proc.environment = env
    if let out = FileHandle(forWritingAtPath: serverLog.path) { proc.standardOutput = out; proc.standardError = out }
    proc.terminationHandler = { [weak self] p in
      DispatchQueue.main.async {
        guard let self, !self.quitting, self.server === p else { return }
        self.server = nil
        self.pageUp = false
        self.say("Q's server stopped. Click for the log, or choose Reload to start it again.", problem: true)
      }
    }
    do { try proc.run() } catch { return say("Couldn't start Q's server: \(error.localizedDescription)", problem: true) }
    server = proc
    quitItem.title = "Quit Q"
    log("started the server (pid \(proc.processIdentifier)) with \(node)")
    say("Starting Q…")
    waitForServer()
  }

  func waitForServer() {
    waiter?.invalidate()
    waiter = Timer.scheduledTimer(withTimeInterval: 0.7, repeats: true) { [weak self] timer in
      askServer { answer in
        guard let self, answer == .q, timer.isValid else { return }
        timer.invalidate()
        self.loadPage()
      }
    }
  }

  func loadPage() {
    log("loading \(pageURL.absoluteString)")
    web.load(URLRequest(url: pageURL))
  }

  // Open the Ollama app if it isn't answering. The page says so if it still isn't there.
  func wakeOllama() {
    var request = URLRequest(url: ollamaURL)
    request.timeoutInterval = 2
    URLSession.shared.dataTask(with: request) { _, response, _ in
      guard response == nil else { return }
      let open = Process()
      open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
      open.arguments = ["-g", "-a", "Ollama"]
      try? open.run()
    }.resume()
  }

  @objc func showLog() { NSWorkspace.shared.open(serverLog) }

  // Stop the server only if this app started it, and give it a moment to stop Whisper and the voice helper.
  func applicationWillTerminate(_ note: Notification) {
    quitting = true
    if !compact { rememberFrame() }
    guard let server, server.isRunning else { return }
    server.terminate()
    let deadline = Date().addingTimeInterval(3)
    while server.isRunning && Date() < deadline { usleep(50_000) }
    log("server stopped: \(!server.isRunning)")
  }

  // ---------- compact and full ----------

  func apply(compact on: Bool, activate: Bool = true) {
    let orb = orbFrame
    compact = on
    captionOn = false
    web.compact = on
    let screen = (window.screen ?? NSScreen.main)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
    var frame: NSRect
    if on {
      window.styleMask = [.borderless]
      window.isOpaque = false
      window.backgroundColor = .clear
      window.hasShadow = false
      window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary] // the orb follows you between Spaces
      // Top right unless it has been dragged somewhere else.
      let origin = saved.string(forKey: "compactOrigin").map(NSPointFromString)
        ?? NSPoint(x: screen.maxX - compactSize.width - cornerMargin, y: screen.maxY - compactSize.height - cornerMargin)
      frame = NSRect(origin: origin, size: compactSize)
    } else {
      window.styleMask = [.titled, .closable, .resizable, .fullSizeContentView]
      window.titlebarAppearsTransparent = true
      window.titleVisibility = .hidden
      window.isOpaque = true
      window.backgroundColor = NSColor(red: 0.02, green: 0.03, blue: 0.07, alpha: 1)
      window.hasShadow = true
      window.collectionBehavior = []
      // Open from the orb's corner, at the size it was last left.
      let size = saved.string(forKey: "fullSize").map(NSSizeFromString) ?? fullSize
      frame = NSRect(x: orb.maxX - size.width, y: orb.maxY - size.height, width: size.width, height: size.height)
    }
    // Never leave it off the edge of the screen (a display may have been unplugged).
    frame.origin.x = min(max(frame.origin.x, screen.minX), screen.maxX - frame.width)
    frame.origin.y = min(max(frame.origin.y, screen.minY), screen.maxY - frame.height)
    window.setFrame(frame, display: true)
    web.evaluateJavaScript("window.qSetCompact && window.qSetCompact(\(on))")
    modeItem.title = on ? "Open panel" : "Shrink to orb"
    if on { window.orderFrontRegardless() } else if activate { show() } else { window.orderFrontRegardless() }
    log(on ? "compact" : "full")
  }

  // The page shows a caption during a turn. The window widens toward the middle
  // of the screen to make room, and the orb stays exactly where it is.
  func setCaption(_ on: Bool) {
    guard compact, on != captionOn else { return }
    let orb = orbFrame
    let screen = (window.screen ?? NSScreen.main)?.visibleFrame ?? orb
    captionOn = on
    var frame = orb
    if on {
      captionLeft = orb.midX > screen.midX
      web.evaluateJavaScript("document.documentElement.classList.toggle('caption-right', \(!captionLeft))")
      frame.size.width += captionWidth
      if captionLeft { frame.origin.x -= captionWidth }
    }
    window.setFrame(frame, display: true)
  }

  func rememberFrame() {
    if compact { saved.set(NSStringFromPoint(orbFrame.origin), forKey: "compactOrigin") }
    else { saved.set(NSStringFromSize(window.frame.size), forKey: "fullSize") }
  }

  // Closing the panel is not quitting: Q goes back to being the orb. Quit is in the menu bar menu.
  func windowShouldClose(_ sender: NSWindow) -> Bool {
    if !compact { rememberFrame(); apply(compact: true) }
    return false
  }

  @objc func switchMode() {
    if !compact { rememberFrame() }
    apply(compact: !compact)
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let what = message.body as? String else { return }
    if what == "expand" && compact { apply(compact: false) }
    if what == "shrink" && !compact { rememberFrame(); apply(compact: true) }
    if what.hasPrefix("state:") {
      statusLine.title = "Q: " + what.dropFirst(6)
      // The page lost a server this app wasn't running (someone else's, now stopped): start our own.
      if what.contains("server not reachable") && pageUp && server?.isRunning != true {
        log("the page lost its server; reconnecting")
        connect()
      }
    }
    if what == "caption-on" { setCaption(true) }
    if what == "caption-off" { setCaption(false) }
  }

  // No Dock icon means no visible menu bar of its own, but the key
  // equivalents still work: without these, ⌘V does nothing in the message box.
  func mainMenu() -> NSMenu {
    let main = NSMenu()
    let appItem = NSMenuItem()
    appItem.submenu = NSMenu()
    appItem.submenu!.addItem(withTitle: "Quit Q's window", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    main.addItem(appItem)
    let editItem = NSMenuItem()
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit
    main.addItem(editItem)
    return main
  }

  func show() {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  @objc func toggle() { if window.isVisible { window.orderOut(nil) } else if compact { window.orderFrontRegardless() } else { show() } }
  @objc func reload() { connect() }

  // Started again while already running (the launcher does this): just come forward.
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if compact || !window.isVisible { apply(compact: true) } else { show() } // a hidden Q comes back as the orb
    return false
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard webView.url?.host == pageURL.host else { return } // the placeholder finishing is not the page
    log("page loaded")
    pageUp = true
    problem = false
    statusLine.title = "Q"
    web.evaluateJavaScript("window.qSetCompact && window.qSetCompact(\(compact))")
  }

  // The server went away between answering and loading: look again.
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    log("load failed: \(error.localizedDescription)")
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.connect() }
  }

  // Q's page is the only thing this window ever shows, so its microphone
  // request is granted without WebKit's own second prompt. macOS still asks once.
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
               type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    let ours = origin.host == pageURL.host && origin.port == (pageURL.port ?? 80) && type == .microphone
    log("page asked for \(type == .microphone ? "microphone" : "camera or both") from \(origin.host):\(origin.port) → \(ours ? "granted" : "refused")")
    decisionHandler(ours ? .grant : .deny)
  }

  // Hold ⌥Space anywhere on the Mac: the page sees its own push-to-talk key go down and up.
  func key(down: Bool) {
    log("⌥Space \(down ? "down" : "up")")
    web.evaluateJavaScript("window.dispatchEvent(new KeyboardEvent('\(down ? "keydown" : "keyup")', { code: 'Space', key: ' ', bubbles: true }))")
  }

  func registerHotKey() {
    var types = [EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
                 EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased))]
    InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
      let down = GetEventKind(event) == UInt32(kEventHotKeyPressed)
      DispatchQueue.main.async { (NSApp.delegate as? Shell)?.key(down: down) }
      return noErr
    }, 2, &types, nil, nil)
    var ref: EventHotKeyRef?
    let status = RegisterEventHotKey(UInt32(kVK_Space), UInt32(optionKey), EventHotKeyID(signature: 0x5153_484B, id: 1), GetApplicationEventTarget(), 0, &ref)
    log(status == noErr ? "global key ⌥Space registered" : "global key not registered (error \(status))")
  }
}

let app = NSApplication.shared
let shell = Shell()
app.delegate = shell
app.setActivationPolicy(.accessory) // menu bar item, no Dock icon
app.run()
