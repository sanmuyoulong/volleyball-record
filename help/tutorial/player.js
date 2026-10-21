(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("embed") === "1") document.documentElement.dataset.embedded = "true";
  const video = document.querySelector("video");
  // Sites' static gateway currently ignores byte ranges. Use our matching
  // public Vercel copy there so chapter seeks do not wait for the whole file.
  // File downloads and local previews continue using the adjacent MP4.
  if (location.hostname.endsWith(".chatgpt.site")) {
    video.querySelector("source").src = "https://volleyball-record.vercel.app/help/tutorial/video.mp4";
    video.load();
  }
  const buttons = [...document.querySelectorAll("[data-time]")];
  const status = document.querySelector(".status");
  const error = document.querySelector(".error");
  let pendingSeek = null;

  function highlight() {
    let active = buttons[0];
    for (const button of buttons) if (Number(button.dataset.time) <= video.currentTime + .05) active = button;
    for (const button of buttons) {
      if (button === active) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }
  async function seek(seconds, play = false) {
    if (video.readyState < 1) {
      pendingSeek = { seconds, play };
      video.load();
      status.textContent = "正在载入视频…";
      return;
    }
    video.currentTime = Math.min(seconds, Math.max(0, video.duration - .1));
    highlight();
    status.textContent = "";
    if (play) {
      try { await video.play(); }
      catch { status.textContent = "已跳转到所选章节，点击播放继续观看。"; }
    }
  }
  for (const button of buttons) button.addEventListener("click", () => seek(Number(button.dataset.time), true));
  video.addEventListener("timeupdate", highlight);
  video.addEventListener("loadedmetadata", () => {
    error.hidden = true;
    if (pendingSeek) {
      const { seconds, play } = pendingSeek;
      pendingSeek = null;
      seek(seconds, play);
    }
  });
  video.addEventListener("error", () => {
    status.textContent = "";
    error.hidden = false;
  });
  const start = Number(params.get("t"));
  if (Number.isFinite(start) && start > 0) seek(start);
  highlight();
})();
