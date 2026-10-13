// Q's native shell: Q's page in its own window, a menu bar item, and a global
// push-to-talk key (⌥Space, D-033) that works from any app.
// The page and the server are unchanged; this only hosts them (D-032).
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

final class Shell: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  var window: NSWindow!
  var web: WKWebView!
  var item: NSStatusItem!

  func applicationDidFinishLaunching(_ note: Notification) {
    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = [] // Q speaks without a click in this window
    web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    web.uiDelegate = self

    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 680),
                      styleMask: [.titled, .closable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
    window.title = "Q"
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.level = .floating
    window.isReleasedWhenClosed = false // closing hides it; the menu bar item brings it back
    window.contentView = web
    window.center()
    window.setFrameAutosaveName("Q")
    show()

    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    item.button?.title = "Q"
    let menu = NSMenu()
    menu.addItem(withTitle: "Show or hide Q", action: #selector(toggle), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "").target = self
    menu.addItem(.separator())
    menu.addItem(withTitle: "Quit Q's window", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "")
    item.menu = menu

    NSApp.mainMenu = mainMenu()
    registerHotKey()
    log("window up, loading \(pageURL.absoluteString)")
    web.load(URLRequest(url: pageURL))
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

  @objc func toggle() { if window.isVisible { window.orderOut(nil) } else { show() } }
  @objc func reload() { web.load(URLRequest(url: pageURL)) }

  // Started again while already running (the launcher does this): just come forward.
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { show(); return false }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { log("page loaded") }

  // The server isn't answering (not started yet, or restarting): keep trying.
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    log("load failed: \(error.localizedDescription); retrying")
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.reload() }
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
