// Spike for D-010: the smallest native shell that could hold Q.
// A floating window showing Q's page, a menu bar item, and a global
// push-to-talk key (⌥Space). Not part of Q; nothing depends on it.
//
// Run through `open` (see build.sh) so macOS attributes the microphone
// request to this app. Flags: --probe (test mic and audio support, then log),
// --log <file>, and a URL to load instead of http://127.0.0.1:4141.

import AppKit
import Carbon.HIToolbox
import WebKit

let args = Array(CommandLine.arguments.dropFirst())
let pageURL = URL(string: args.first(where: { $0.hasPrefix("http") }) ?? "http://127.0.0.1:4141")!
let probe = args.contains("--probe")
let logFile: FileHandle? = {
  guard let i = args.firstIndex(of: "--log"), i + 1 < args.count else { return nil }
  FileManager.default.createFile(atPath: args[i + 1], contents: nil)
  return FileHandle(forWritingAtPath: args[i + 1])
}()
let launched = Date()

func log(_ what: String) {
  let line = String(format: "%7.0f ms  %@\n", Date().timeIntervalSince(launched) * 1000, what)
  logFile?.write(line.data(using: .utf8)!)
  FileHandle.standardOutput.write(line.data(using: .utf8)!)
}

// What the page can do inside WebKit. Asking for the microphone here is what
// makes macOS show its permission prompt the first time.
let probeScript = """
const out = { secureContext: window.isSecureContext, mediaDevices: !!navigator.mediaDevices,
  mediaRecorder: !!window.MediaRecorder, speechSynthesis: !!window.speechSynthesis, userAgent: navigator.userAgent };
out.recorderTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].filter((t) => window.MediaRecorder?.isTypeSupported?.(t));
const AC = window.AudioContext || window.webkitAudioContext;
if (AC) { const c = new AC(); out.audioContext = c.state; c.close(); }
if (navigator.mediaDevices) {
  const t0 = performance.now();
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    out.micOpenMs = Math.round(performance.now() - t0);
    out.mic = s.getAudioTracks()[0]?.label;
    s.getTracks().forEach((t) => t.stop());
  } catch (e) { out.micError = e.name + ': ' + e.message; }
}
return JSON.stringify(out);
"""

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
    window.titlebarAppearsTransparent = true
    window.titleVisibility = .hidden
    window.level = .floating
    window.isReleasedWhenClosed = false
    window.contentView = web
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    item.button?.title = "Q"
    let menu = NSMenu()
    menu.addItem(withTitle: "Show or hide Q", action: #selector(toggle), keyEquivalent: "").target = self
    menu.addItem(withTitle: "Quit Q shell", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    item.menu = menu

    registerHotKey()
    log("window up, loading \(pageURL.absoluteString)")
    web.load(URLRequest(url: pageURL))
  }

  @objc func toggle() {
    if window.isVisible { window.orderOut(nil) } else { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    log("page loaded")
    guard probe else { return }
    web.callAsyncJavaScript(probeScript, arguments: [:], in: nil, in: .page) { result in
      switch result {
      case .success(let value): log("probe \(value)")
      case .failure(let error): log("probe failed: \(error.localizedDescription)")
      }
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    log("load failed: \(error.localizedDescription)")
  }

  // Q's page is the only thing this window ever shows, so its microphone
  // request is granted without WebKit's own second prompt. macOS still asks once.
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
               type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    let ours = origin.host == pageURL.host && origin.port == (pageURL.port ?? 80)
    log("page asked for \(type == .microphone ? "microphone" : "camera or both") from \(origin.host):\(origin.port) → \(ours && type == .microphone ? "granted" : "refused")")
    decisionHandler(ours && type == .microphone ? .grant : .deny)
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
