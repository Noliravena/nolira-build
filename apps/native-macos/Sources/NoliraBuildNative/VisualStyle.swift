import AppKit
import SwiftUI

enum NoliraTheme {
    static let canvas = Color(red: 0.045, green: 0.043, blue: 0.060)
    static let chrome = Color(red: 0.063, green: 0.060, blue: 0.080)
    static let panel = Color(red: 0.080, green: 0.076, blue: 0.100)
    static let elevated = Color(red: 0.105, green: 0.098, blue: 0.132)
    static let terminal = Color(red: 0.028, green: 0.028, blue: 0.040)
    static let purple = Color(red: 0.63, green: 0.46, blue: 1.00)
    static let magenta = Color(red: 0.96, green: 0.36, blue: 0.74)
    static let cyan = Color(red: 0.27, green: 0.78, blue: 0.96)
    static let green = Color(red: 0.30, green: 0.86, blue: 0.57)
    static let warning = Color(red: 1.00, green: 0.66, blue: 0.30)
    static let separator = Color.white.opacity(0.065)
    static let softText = Color.white.opacity(0.62)
    static let faintText = Color.white.opacity(0.37)

    static let accentGradient = LinearGradient(
        colors: [purple, magenta],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let ambientGradient = LinearGradient(
        colors: [
            Color(red: 0.13, green: 0.09, blue: 0.20),
            canvas,
            Color(red: 0.035, green: 0.055, blue: 0.080),
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

struct WorkspaceBackdrop: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack {
                NoliraTheme.ambientGradient
                Circle()
                    .fill(NoliraTheme.purple.opacity(0.13))
                    .frame(width: proxy.size.width * 0.46)
                    .blur(radius: 120)
                    .offset(x: -proxy.size.width * 0.30, y: -proxy.size.height * 0.38)
                Circle()
                    .fill(NoliraTheme.magenta.opacity(0.08))
                    .frame(width: proxy.size.width * 0.36)
                    .blur(radius: 120)
                    .offset(x: proxy.size.width * 0.38, y: -proxy.size.height * 0.20)
                Circle()
                    .fill(NoliraTheme.cyan.opacity(0.055))
                    .frame(width: proxy.size.width * 0.42)
                    .blur(radius: 150)
                    .offset(x: proxy.size.width * 0.18, y: proxy.size.height * 0.48)
            }
            .ignoresSafeArea()
        }
    }
}

struct WorkspaceDivider: View {
    var body: some View {
        Rectangle()
            .fill(NoliraTheme.separator)
            .frame(width: 1)
    }
}

struct SectionEyebrow: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack(spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .tracking(1.15)
                .foregroundStyle(NoliraTheme.faintText)
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(NoliraTheme.faintText)
            }
        }
    }
}

struct ShortcutKey: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 9.5, weight: .semibold, design: .rounded))
            .foregroundStyle(Color.white.opacity(0.52))
            .padding(.horizontal, 5)
            .padding(.vertical, 2.5)
            .background(Color.white.opacity(0.065), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .stroke(Color.white.opacity(0.055), lineWidth: 1)
            }
    }
}

struct StatusDot: View {
    let color: Color
    var pulsing = false

    var body: some View {
        ZStack {
            if pulsing {
                Circle().fill(color.opacity(0.18)).frame(width: 14, height: 14)
            }
            Circle().fill(color).frame(width: 6, height: 6)
        }
        .frame(width: 14, height: 14)
    }
}

struct GlassIconButton: View {
    let systemName: String
    let help: String
    var selected = false
    var badge: String?
    let action: () -> Void

    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: systemName)
                    .font(.system(size: 13.5, weight: selected ? .semibold : .medium))
                    .foregroundStyle(selected ? Color.white : Color.white.opacity(hovered ? 0.90 : 0.58))
                    .frame(width: 31, height: 31)
                    .background {
                        if selected {
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(NoliraTheme.purple.opacity(0.24))
                        } else if hovered {
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .fill(Color.white.opacity(0.055))
                        }
                    }
                    .overlay {
                        if selected {
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .stroke(NoliraTheme.purple.opacity(0.38), lineWidth: 1)
                        }
                    }

                if let badge {
                    Text(badge)
                        .font(.system(size: 7.5, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 3.5)
                        .padding(.vertical, 1.5)
                        .background(NoliraTheme.magenta, in: Capsule())
                        .offset(x: 4, y: -3)
                }
            }
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .help(help)
    }
}

struct RaycastChip: View {
    let icon: String?
    let text: String
    var tint: Color = .white
    var active = false

    var body: some View {
        HStack(spacing: 5) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 10.5, weight: .semibold))
            }
            Text(text)
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .lineLimit(1)
            Image(systemName: "chevron.down")
                .font(.system(size: 7.5, weight: .bold))
                .opacity(0.45)
        }
        .foregroundStyle(active ? tint : Color.white.opacity(0.68))
        .padding(.horizontal, 8)
        .frame(height: 25)
        .background(
            active ? tint.opacity(0.12) : Color.white.opacity(0.045),
            in: RoundedRectangle(cornerRadius: 7, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .stroke(active ? tint.opacity(0.22) : Color.white.opacity(0.045), lineWidth: 1)
        }
    }
}

struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async { configure(view.window) }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async { configure(nsView.window) }
    }

    private func configure(_ window: NSWindow?) {
        guard let window else { return }
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = NSColor.clear
        window.isOpaque = false
        window.isMovableByWindowBackground = true
        window.toolbarStyle = .unifiedCompact
    }
}

extension View {
    func noliraPanel(cornerRadius: CGFloat = 0, opacity: Double = 0.82) -> some View {
        background(
            NoliraTheme.panel.opacity(opacity),
            in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(Color.white.opacity(0.055), lineWidth: cornerRadius > 0 ? 1 : 0)
        }
    }

    @ViewBuilder
    func noliraGlass(
        cornerRadius: CGFloat = 14,
        tint: Color? = nil,
        interactive: Bool = false
    ) -> some View {
        if #available(macOS 26.0, *) {
            glassEffect(
                Glass.regular.tint(tint).interactive(interactive),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
        } else {
            background(
                .ultraThinMaterial,
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            }
        }
    }

    func noliraShadow() -> some View {
        shadow(color: .black.opacity(0.34), radius: 24, y: 12)
    }
}
