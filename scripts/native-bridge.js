(() => {
  "use strict";

  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;

  document.documentElement.classList.add("herdharbor-native", `herdharbor-${capacitor.getPlatform()}`);

  const plugins = capacitor.Plugins || {};
  const Filesystem = plugins.Filesystem;
  const Share = plugins.Share;
  const Browser = plugins.Browser;
  const StatusBar = plugins.StatusBar;

  async function configureStatusBar() {
    if (!StatusBar) return;
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: "#F7F3EA" });
      await StatusBar.setStyle({ style: "LIGHT" });
    } catch (error) {
      console.warn("HerdHarbor could not configure the native status bar.", error);
    }
  }

  function safeFileName(value) {
    return String(value || `herdharbor-${Date.now()}`)
      .replace(/[\\/:*?\"<>|]+/g, "-")
      .slice(0, 120);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Could not read the downloaded file."));
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.readAsDataURL(blob);
    });
  }

  async function shareDownload(anchor) {
    if (!Filesystem || !Share) return false;
    const href = anchor.href;
    if (!href || (!href.startsWith("blob:") && !href.startsWith("data:"))) return false;

    try {
      const response = await fetch(href);
      const blob = await response.blob();
      const data = await blobToBase64(blob);
      const fileName = safeFileName(anchor.download);
      const saved = await Filesystem.writeFile({
        path: `exports/${Date.now()}-${fileName}`,
        data,
        directory: "CACHE",
        recursive: true
      });
      await Share.share({
        title: fileName,
        text: "Exported from HerdHarbor",
        url: saved.uri,
        dialogTitle: "Save or share HerdHarbor export"
      });
      return true;
    } catch (error) {
      console.error("HerdHarbor could not open the native save sheet.", error);
      return false;
    }
  }

  document.addEventListener("click", async (event) => {
    const anchor = event.target.closest("a");
    if (!anchor) return;

    if (anchor.hasAttribute("download")) {
      event.preventDefault();
      const handled = await shareDownload(anchor);
      if (!handled) window.location.href = anchor.href;
      return;
    }

    let url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }

    const isExternalWebLink = /^https?:$/.test(url.protocol) &&
      !["app.herdharbor.com", "herdharbor.com", "www.herdharbor.com"].includes(url.hostname);

    if (isExternalWebLink && Browser) {
      event.preventDefault();
      try {
        await Browser.open({ url: url.href, presentationStyle: "popover" });
      } catch (error) {
        console.warn("HerdHarbor could not open the external link natively.", error);
        window.location.href = url.href;
      }
    }
  }, true);

  configureStatusBar();
  window.HerdHarborNative = Object.freeze({
    isNative: true,
    platform: capacitor.getPlatform(),
    shareDownload
  });
})();
