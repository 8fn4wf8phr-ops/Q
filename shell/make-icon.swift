// Turns the app-icon SVGs into the PNG set that iconutil packs into Q.icns.
// Used only while building:  make-icon <icon.svg> <icon-small.svg> <Q.iconset>
import AppKit

let a = CommandLine.arguments
guard a.count == 4, let large = NSImage(contentsOfFile: a[1]), let small = NSImage(contentsOfFile: a[2]) else {
  FileHandle.standardError.write("make-icon: couldn't read the SVGs\n".data(using: .utf8)!)
  exit(1)
}
try? FileManager.default.createDirectory(atPath: a[3], withIntermediateDirectories: true)
let sizes: [(String, Int)] = [("16x16", 16), ("16x16@2x", 32), ("32x32", 32), ("32x32@2x", 64), ("128x128", 128), ("128x128@2x", 256),
                              ("256x256", 256), ("256x256@2x", 512), ("512x512", 512), ("512x512@2x", 1024)]
for (name, px) in sizes {
  guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                                   hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { exit(1) }
  rep.size = NSSize(width: px, height: px)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  (px <= 32 ? small : large).draw(in: NSRect(x: 0, y: 0, width: px, height: px)) // the simpler cut where detail would blur
  NSGraphicsContext.restoreGraphicsState()
  guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
  try? png.write(to: URL(fileURLWithPath: "\(a[3])/icon_\(name).png"))
}
