// Q speech helper — one long-running process that turns sentences into audio.
// `say` costs over a second of startup per sentence; this stays loaded.
//
// Protocol (driven by server.js):
//   on start   → {"ready":true,"voices":[{id,name,lang,quality}]}\n
//   stdin      ← {"id":1,"text":"...","voice":"<voice id or empty>"}\n   one per line
//   stdout     → {"id":1,"sampleRate":22050,"bytes":N,"ms":12.3,"voice":"Samantha"}\n
//                followed by N bytes of 16-bit little-endian mono PCM
//   on failure → {"id":1,"error":"...","bytes":0}\n
// Requests are handled strictly one at a time, in order. The process exits
// when stdin closes, so it never outlives the server. It makes no network
// calls and plays no sound itself.

import AVFoundation
import Foundation

let synth = AVSpeechSynthesizer()
let stdout = FileHandle.standardOutput

func send(_ header: [String: Any], _ body: Data = Data()) {
  guard var data = try? JSONSerialization.data(withJSONObject: header) else { return }
  data.append(0x0A)
  data.append(body)
  stdout.write(data)
}

func nowMs() -> Double { Double(DispatchTime.now().uptimeNanoseconds) / 1e6 }

// Voices deliver Int16, Float32 or Int32 buffers depending on the voice.
func int16Data(_ b: AVAudioPCMBuffer) -> Data {
  let n = Int(b.frameLength)
  if let p = b.int16ChannelData { return Data(bytes: p[0], count: n * 2) }
  var samples = [Int16](repeating: 0, count: n)
  if let p = b.floatChannelData {
    for i in 0..<n { samples[i] = Int16(max(-1, min(1, p[0][i])) * 32767) }
  } else if let p = b.int32ChannelData {
    for i in 0..<n { samples[i] = Int16(truncatingIfNeeded: p[0][i] >> 16) }
  }
  return samples.withUnsafeBufferPointer { Data(buffer: $0) }
}

// The end of an utterance is normally a zero-length buffer. The delegate
// callback is only a backstop in case a voice never sends one: it arrives
// late, often after the next utterance has started, so it is tied to its own
// utterance and given a short grace period. Without that check it ended the
// following sentence with no audio.
final class Finish: NSObject, AVSpeechSynthesizerDelegate {
  var current: AVSpeechUtterance?
  var onFinish: (() -> Void)?
  private func ended(_ u: AVSpeechUtterance) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { if u === self.current { self.onFinish?() } }
  }
  func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) { ended(u) }
  func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) { ended(u) }
}
let finishDelegate = Finish()
synth.delegate = finishDelegate

func speak(id: Int, text: String, voiceId: String, done: @escaping () -> Void) {
  let utterance = AVSpeechUtterance(string: text)
  guard let voice = AVSpeechSynthesisVoice(identifier: voiceId) ?? AVSpeechSynthesisVoice(language: "en-US") else {
    send(["id": id, "error": "no voice available", "bytes": 0])
    done()
    return
  }
  utterance.voice = voice
  let started = nowMs()
  var pcm = Data()
  var rate = 22050.0
  var finished = false
  let finish = {
    if finished { return }
    finished = true
    finishDelegate.current = nil
    finishDelegate.onFinish = nil
    send(["id": id, "sampleRate": Int(rate), "bytes": pcm.count, "ms": nowMs() - started, "voice": voice.name], pcm)
    done()
  }
  finishDelegate.current = utterance
  finishDelegate.onFinish = finish
  synth.write(utterance) { buffer in
    guard let b = buffer as? AVAudioPCMBuffer else { return }
    let chunk = int16Data(b)
    let sampleRate = b.format.sampleRate
    DispatchQueue.main.async {
      if finished { return }
      if chunk.isEmpty { finish(); return }
      rate = sampleRate
      pcm.append(chunk)
    }
  }
}

let voices = AVSpeechSynthesisVoice.speechVoices()
  .filter { $0.language.hasPrefix("en") }
  .map { ["id": $0.identifier, "name": $0.name, "lang": $0.language, "quality": $0.quality.rawValue] as [String: Any] }
send(["ready": true, "voices": voices])

Thread.detachNewThread {
  while let line = readLine() {
    guard let data = line.data(using: .utf8),
          let req = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let id = req["id"] as? Int, let text = req["text"] as? String else {
      send(["id": -1, "error": "bad request", "bytes": 0])
      continue
    }
    let wait = DispatchSemaphore(value: 0)
    DispatchQueue.main.async { speak(id: id, text: text, voiceId: req["voice"] as? String ?? "") { wait.signal() } }
    wait.wait()
  }
  exit(0)
}
RunLoop.main.run()
