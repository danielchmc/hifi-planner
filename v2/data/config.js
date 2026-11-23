/* HiFi Planner settings. Safe to edit by hand. */
window.HP_DATA = window.HP_DATA || {};
window.HP_DATA.config = {
  // Shop numbers that may open the planner (same list as the old version).
  shops: ["401", "404", "407", "408", "409", "410", "411", "412", "415", "418", "421", "422", "424", "426", "428", "429", "433", "434", "438", "440", "442"],
  // Code that unlocks Admin mode under Settings. This only hides the admin tools from staff;
  // the real protection is the GitHub token, which is needed to publish anything.
  adminCode: "44240",
  // Where "Publish" commits the catalogue. "path" is the folder of this app inside the repository ("" for the root).
  github: { owner: "danielchmc", repo: "hifi-planner", branch: "main", path: "v2" },
  // The address of the live planner: the QR code on a printed proposal links here, also when printed from a local copy.
  publicUrl: "https://hifiplanner.dk/v2/",
  // Usage statistics (Umami, cookieless): the website id from cloud.umami.is. Empty = off. Per shop, and per seller once told (js/stats.js).
  analytics: { umami: "717c1877-66cd-4ee1-bc50-c35c302b5995" },
  supportPhone: "30686303",
  feedbackUrl: "https://docs.google.com/forms/d/e/1FAIpQLSc84cmZgNr_lxXG7VqGd6xRD4UWbcvBiuaOobcauY2_yj3aMA/viewform?usp=dialog"
};
