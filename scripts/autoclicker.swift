import Foundation
import CoreGraphics
import AppKit

struct Config {
    let x: Double?
    let y: Double?
    let cps: Double
    let duration: Double?
    let followMouse: Bool
}

enum ConfigError: Error {
    case invalidArgs(String)
}

func parseArgs() throws -> Config {
    var x: Double? = nil
    var y: Double? = nil
    var cps = 10.0
    var duration: Double? = nil
    var followMouse = false

    var i = 1
    let args = CommandLine.arguments

    while i < args.count {
        let arg = args[i]

        switch arg {
        case "--x":
            i += 1
            guard i < args.count, let value = Double(args[i]) else {
                throw ConfigError.invalidArgs("Missing or invalid value for --x")
            }
            x = value
        case "--y":
            i += 1
            guard i < args.count, let value = Double(args[i]) else {
                throw ConfigError.invalidArgs("Missing or invalid value for --y")
            }
            y = value
        case "--cps":
            i += 1
            guard i < args.count, let value = Double(args[i]), value > 0 else {
                throw ConfigError.invalidArgs("Missing or invalid value for --cps (must be > 0)")
            }
            cps = value
        case "--seconds":
            i += 1
            guard i < args.count, let value = Double(args[i]), value > 0 else {
                throw ConfigError.invalidArgs("Missing or invalid value for --seconds (must be > 0)")
            }
            duration = value
        case "--follow-mouse":
            followMouse = true
        case "--help", "-h":
            print("Usage: swift scripts/autoclicker.swift [--x 500 --y 500] [--cps 10] [--seconds 30] [--follow-mouse]")
            print("- Without --x/--y: uses current mouse position at start")
            print("- With --follow-mouse: reads mouse position before every click")
            print("Example: npm run autoclick -- --cps 8")
            print("Example: npm run autoclick -- --follow-mouse --cps 12")
            exit(0)
        default:
            throw ConfigError.invalidArgs("Unknown argument: \(arg)")
        }

        i += 1
    }

    if (x == nil) != (y == nil) {
        throw ConfigError.invalidArgs("Provide both --x and --y, or neither")
    }

    return Config(x: x, y: y, cps: cps, duration: duration, followMouse: followMouse)
}

func click(at point: CGPoint) {
    guard let mouseDown = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
          let mouseUp = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) else {
        return
    }

    mouseDown.post(tap: .cghidEventTap)
    mouseUp.post(tap: .cghidEventTap)
}

func currentMousePoint() -> CGPoint {
    NSEvent.mouseLocation
}

do {
    let config = try parseArgs()

    let clickInterval = 1.0 / config.cps
    let start = Date()

    let fixedPoint: CGPoint
    if let x = config.x, let y = config.y {
        fixedPoint = CGPoint(x: x, y: y)
    } else {
        fixedPoint = currentMousePoint()
    }

    if config.followMouse {
        print("Autoclicker gestart (volgt muis) met \(config.cps) clicks/sec")
    } else {
        print("Autoclicker gestart op (\(Int(fixedPoint.x)), \(Int(fixedPoint.y))) met \(config.cps) clicks/sec")
    }

    if let seconds = config.duration {
        print("Duur: \(seconds) sec")
    } else {
        print("Duur: oneindig (stop met Ctrl+C)")
    }

    while true {
        let point = config.followMouse ? currentMousePoint() : fixedPoint
        click(at: point)
        usleep(useconds_t(clickInterval * 1_000_000))

        if let seconds = config.duration,
           Date().timeIntervalSince(start) >= seconds {
            break
        }
    }

    print("Klaar.")
} catch ConfigError.invalidArgs(let message) {
    fputs("Fout: \(message)\n", stderr)
    fputs("Gebruik --help voor opties.\n", stderr)
    exit(1)
} catch {
    fputs("Onverwachte fout: \(error)\n", stderr)
    exit(1)
}
