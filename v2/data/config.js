/* HiFi Planner settings. Safe to edit by hand. */
window.HP_DATA = window.HP_DATA || {};
window.HP_DATA.config = {
  // Shop numbers that may open the planner (same list as the old version).
  shops: ["442", "422", "415", "421", "418", "411", "424", "428", "438", "426", "412", "409", "433", "401", "434", "410", "404"],
  // Code that unlocks Admin mode under Settings. This only hides the admin tools from staff;
  // the real protection is the GitHub token, which is needed to publish anything.
  adminCode: "hifi-admin",
  // Where "Publish" commits the catalogue. "path" is the folder of this app inside the repository ("" for the root).
  github: { owner: "danielchmc", repo: "hifi-planner", branch: "main", path: "v2" },
  supportPhone: "30686303",
  feedbackUrl: "https://docs.google.com/forms/d/e/1FAIpQLSc84cmZgNr_lxXG7VqGd6xRD4UWbcvBiuaOobcauY2_yj3aMA/viewform?usp=dialog"
};
