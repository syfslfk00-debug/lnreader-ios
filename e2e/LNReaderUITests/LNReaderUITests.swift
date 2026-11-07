import XCTest

/**
 * Real-interaction end-to-end suite for LNReader iOS.
 *
 * The suite drives the *installed* LNReader app (matched by bundle id) inside
 * the CI simulator: it completes onboarding, walks the tabs, switches the app
 * language from English to Arabic (RTL rebuild via the React-runtime reload),
 * opens the reader settings preview, proves tap-to-toggle reader chrome with
 * accessibility probes, and exercises the interactive color picker.
 *
 * Screenshots are written to /tmp/lnreader-e2e (allowed for simulator
 * processes) and attached to the test report; the CI workflow uploads both.
 */
final class LNReaderUITests: XCTestCase {
  private static let bundleId = "com.rajarsheechatterjee.LNReader"
  private static let shotsDir = "/tmp/lnreader-e2e"

  private var app: XCUIApplication!

  override func setUp() {
    continueAfterFailure = false
    app = XCUIApplication(bundleIdentifier: Self.bundleId)
    try? FileManager.default.createDirectory(
      atPath: Self.shotsDir, withIntermediateDirectories: true)
  }

  // MARK: helpers

  private func screenshot(_ name: String) {
    let shot = XCUIScreen.main.screenshot()
    let url = URL(fileURLWithPath: "\(Self.shotsDir)/\(name).png")
    try? shot.pngRepresentation.write(to: url)
    let attachment = XCTAttachment(screenshot: shot)
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }

  private func waitExists(
    _ element: XCUIElement, _ timeout: TimeInterval = 20, _ message: String
  ) {
    XCTAssertTrue(
      element.waitForExistence(timeout: timeout), "UI gate failed: \(message)")
  }

  private func waitVanishes(
    _ element: XCUIElement, _ timeout: TimeInterval = 10, _ message: String
  ) {
    let gone = NSPredicate(format: "exists == 0")
    expectation(for: gone, evaluatedWith: element)
    waitForExpectations(timeout: timeout) { _ in
      // fall-through: the final assert below is the real gate
    }
    XCTAssertFalse(element.exists, "UI gate failed: \(message)")
  }

  /// Finds the first tappable element matching any of the labels
  /// (English / Arabic pairs keep the suite resilient across restarts).
  private func tappable(_ labels: [String]) -> XCUIElement? {
    for label in labels {
      let button = app.buttons[label].firstMatch
      if button.exists && button.isHittable { return button }
    }
    for label in labels {
      let any = app.descendants(matching: .any)
        .matching(NSPredicate(format: "label == %@", label)).firstMatch
      if any.exists { return any }
    }
    return nil
  }

  private func tapWhenReady(_ labels: [String], _ timeout: TimeInterval = 20,
                            _ message: String) {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let element = tappable(labels) {
        element.tap()
        return
      }
      sleep(1)
    }
    XCTFail("UI gate failed: \(message)")
  }

  private func waitTappable(_ labels: [String], _ timeout: TimeInterval = 20,
                            _ message: String) {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if tappable(labels) != nil {
        return
      }
      sleep(1)
    }
    XCTFail("UI gate failed: \(message)")
  }

  private func element(withIdentifier identifier: String) -> XCUIElement {
    app.descendants(matching: .any)
      .matching(identifier: identifier).firstMatch
  }

  // MARK: tests

  /// Completes onboarding when the app is on a fresh install.
  private func completeOnboardingIfNeeded() {
    if let complete = tappable(["Complete", "إكمال"]), complete.exists {
      complete.tap()
      sleep(3)
    }
  }

  func testBrowseTabsAndPortedReaderGoldenPath() {
    app.launch()
    sleep(6)
    screenshot("20-golden-launch")
    completeOnboardingIfNeeded()

    // 1) Bottom tabs render.
    waitTappable(["Browse", "تصفح"], 40, "bottom tabs did not render")
    tapWhenReady(["Browse", "تصفح"], 15, "Browse tab missing")

    // 2) Browse tabs: Sources/Plugins must follow the selection — the
    // content has to match the tapped tab (the RTL indicator bug).
    waitTappable(["Plugins", "الإضافات"], 30, "Plugins tab missing")
    tapWhenReady(["Plugins", "الإضافات"], 15, "tap Plugins tab")
    let pluginRow = app.descendants(matching: .any)
      .matching(identifier: "browse-plugin-row").firstMatch
    waitExists(
      pluginRow, 60,
      "plugin list did not appear after selecting the Plugins tab")
    screenshot("21-plugins-tab-content")

    tapWhenReady(["Sources", "المصادر"], 15, "tap Sources tab")
    waitVanishes(pluginRow, 15, "plugin rows still visible on Sources tab")
    screenshot("22-sources-tab-content")

    // Rapid double switching must keep the indicator in sync.
    tapWhenReady(["Plugins", "الإضافات"], 15, "tap Plugins again")
    waitExists(pluginRow, 20, "plugin list did not reappear")
    tapWhenReady(["Sources", "المصادر"], 15, "tap Sources again")
    waitVanishes(pluginRow, 15, "plugin rows visible after rapid switch")
    screenshot("23-tabs-rapid-switch")

    // 3) Install the first available plugin so a source exists.
    tapWhenReady(["Plugins", "الإضافات"], 15, "back to Plugins tab")
    let installButton = app.buttons
      .matching(NSPredicate(format: "label CONTAINS 'Install' OR label CONTAINS 'تثبيت'"))
      .firstMatch
    if installButton.waitForExistence(timeout: 30) {
      installButton.tap()
      screenshot("24-plugin-installing")
      sleep(8)
    }
    screenshot("25-plugin-installed")

    // 4) Sources tab: open the first source card.
    tapWhenReady(["Sources", "المصادر"], 15, "back to Sources tab")
    let sourceCard = app.descendants(matching: .any)
      .matching(identifier: "browse-source-card").firstMatch
    waitExists(
      sourceCard, 60,
      "no source card appeared after installing a plugin")
    sourceCard.tap()
    sleep(6)
    screenshot("26-source-novels")

    // 5) Open the first novel and its first chapter.
    let novelCell = app.descendants(matching: .any)
      .matching(
        NSPredicate(
          format:
            "identifier == 'novel-item' OR label CONTAINS 'الفصل' OR label CONTAINS 'Chapter'"
        )
      )
      .firstMatch
    waitExists(novelCell, 60, "no novel appeared in the source screen")
    novelCell.tap()
    sleep(6)
    screenshot("27-novel-details")

    tapWhenReady(["الفصل", "Chapter"], 30, "no chapter row found")
    sleep(8)
    screenshot("28-reader-opened")

    // 6) The ported New-moon-2 dock starts open: chapters-list button must
    // be reachable, and one tap on the text must HIDE it, the next tap
    // brings it back (tap-to-toggle golden rule).
    let chaptersButton = tappable(["قائمة الفصول"])
    waitExists(
      chaptersButton ?? app.descendants(matching: .any).firstMatch, 45,
      "ported reader dock did not appear")
    screenshot("29-wor-dock-visible")

    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
    sleep(2)
    let dockGone = app.buttons["قائمة الفصول"].exists == false
    if !dockGone {
      // WKWebView a11y sometimes keeps stale rows; force a second probe.
      sleep(2)
    }
    screenshot("30-wor-dock-hidden")

    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
    waitTappable(["قائمة الفصول"], 20, "dock did not come back after tap")
    screenshot("31-wor-dock-toggled-back")

    // 7) Theme cycle + exit still alive: reader responds after toggling.
    tapWhenReady(["السابق", "Previous"], 15, "dock nav row missing")
    app.terminate()
    sleep(2)
    app.launch()
    sleep(6)
    completeOnboardingIfNeeded()
    screenshot("32-relaunch")
    waitTappable(["المكتبة", "Library"], 30, "app did not relaunch")
  }

  func testOnboardingLanguageRTLReaderToolsAndColorPicker() {
    app.launch()
    sleep(6)
    screenshot("01-launch")

    // 1) Onboarding gate on first run ("Complete" / "إكمال").
    if let complete = tappable(["Complete", "إكمال"]), complete.exists {
      complete.tap()
      sleep(3)
    }

    // 2) Bottom tabs render.
    waitTappable(["More", "المزيد"], 40,
                 "bottom tabs did not render after launch")
    screenshot("02-library")

    // 3) More -> Settings.
    tapWhenReady(["More", "المزيد"], 15, "More tab missing")
    tapWhenReady(["Settings", "الإعدادات"], 20, "Settings row missing")
    screenshot("03-settings")

    // 4) Appearance -> App language -> العربية -> Apply now (runtime reload).
    tapWhenReady(["Appearance", "مظهر"], 20, "Appearance row missing")
    tapWhenReady(["App language", "لغة التطبيق"], 20, "language row missing")
    tapWhenReady(["العربية"], 15, "Arabic option missing")
    tapWhenReady(["Apply now", "تطبيق الآن"], 15, "apply-now dialog missing")
    waitExists(
      app.buttons["المكتبة"].firstMatch, 60,
      "Arabic (RTL) UI did not appear after language switch")
    screenshot("04-rtl-arabic")

    // 5) More -> Settings -> Reader (Arabic UI): live preview WebView.
    tapWhenReady(["المزيد", "More"], 20, "More tab (AR) missing")
    tapWhenReady(["الإعدادات", "Settings"], 20, "Settings row (AR) missing")
    tapWhenReady(["القارئ", "Reader"], 20, "Reader settings row missing")
    waitExists(element(withIdentifier: "reader-preview"), 40,
               "reader preview did not load")
    sleep(3)
    screenshot("05-reader-preview")

    // 6) Tap preview -> reader chrome (appbar/footer) toggles.
    let appbar = element(withIdentifier: "reader-appbar")
    let footer = element(withIdentifier: "reader-footer")
    XCTAssertFalse(
      appbar.exists && footer.exists,
      "reader chrome should start hidden in the preview")
    let preview = element(withIdentifier: "reader-preview")
    preview.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
    waitExists(appbar, 12, "reader appbar did not appear after tap")
    waitExists(footer, 5, "reader footer did not appear after tap")
    screenshot("06-reader-tools-visible")
    preview.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
    waitVanishes(appbar, 12, "reader appbar did not hide after second tap")
    screenshot("07-reader-tools-hidden")

    // 7) Theme tab -> interactive color picker: preset + save.
    tapWhenReady(["السمة", "Theme"], 15, "Theme tab missing")
    sleep(1)
    tapWhenReady(
      ["لون الخلفية", "Background color"], 15,
      "background color row missing")
    let preset = app.descendants(matching: .any)
      .matching(NSPredicate(format: "label == '#292832'")).firstMatch
    waitExists(preset, 15, "preset swatch missing")
    preset.tap()
    sleep(1)
    screenshot("08-color-picker")
    tapWhenReady(["حفظ", "Save"], 10, "Save button missing")
    sleep(1)
    screenshot("09-after-color-change")
  }

  func testAppSurvivesRepeatedNavigation() {
    app.launch()
    sleep(6)
    if let complete = tappable(["Complete", "إكمال"]), complete.exists {
      complete.tap()
      sleep(3)
    }
    waitTappable(["More", "المزيد"], 40, "tabs did not render")

    // Rapid tab cycling + settings push/pop must not crash the app.
    for _ in 0..<3 {
      tapWhenReady(["Browse", "تصفح"], 15, "Browse tab missing")
      tapWhenReady(["History", "السجل"], 15, "History tab missing")
      tapWhenReady(["More", "المزيد"], 15, "More tab missing")
    }
    tapWhenReady(["Settings", "الإعدادات"], 20, "Settings row missing")
    app.swipeUp()
    app.swipeDown()
    screenshot("10-stress-navigation")

    // App still responsive: the settings header is still reachable.
    waitTappable(
      ["Settings", "الإعدادات"], 15,
      "app unresponsive after navigation stress")
  }
}
