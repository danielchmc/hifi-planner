/*  ───────────────────────────────────────────────────────────────
    CI‑MODE  •  compact cards  +  viewport‑filling floor plan
    ─────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

    /* ===== element refs ===== */
    const body = document.body;
    const canvasContainer = document.getElementById("canvas-container");
    const canvasContent = document.getElementById("canvas-content");
    const toggle = document.getElementById("ciModeToggle");
    const uploadInput = document.getElementById("floorUpload");
    const imgSizeInput = document.getElementById("ciImgSize");
    const imgSizeWrap = document.getElementById("ciImgSizeWrap");
    const ciDialog = document.getElementById("ciConfirm");   // NEW
    const ciProceed = document.getElementById("ciProceed");   // NEW
    if (!canvasContent || !toggle) return;   // safety

    const rootStyles = getComputedStyle(document.documentElement);

    /* ===== floor‑plan layer (always first child) ===== */
    const planLayer = document.createElement("img");
    planLayer.id = "floorplan-layer";
    planLayer.alt = "Floor plan";
    planLayer.style.cssText =
        "display:none;position:absolute;pointer-events:none;";
    canvasContent.insertBefore(planLayer, canvasContent.firstChild);

    /* — upload blueprint and fill the viewport — */
    uploadInput.addEventListener("change", e => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            alert("Please pick a PNG or JPG image.");
            return;
        }

        /* revoke any previous ObjectURL to avoid leaks */
        if (planLayer.dataset.url) URL.revokeObjectURL(planLayer.dataset.url);

        /* create new ObjectURL & remember it */
        const url = URL.createObjectURL(file);
        planLayer.dataset.url = url;
        planLayer.src = url;

        planLayer.onload = () => {
            /* ——— RESET any old geometry ——— */
            planLayer.style.left = "0";
            planLayer.style.top = "0";
            planLayer.style.transform = "none";

            /* —— compute current viewport —— */
            const vpW = canvasContainer.clientWidth;
            const vpH = canvasContainer.clientHeight;
            const scale = Math.max(
                vpW / planLayer.naturalWidth,
                vpH / planLayer.naturalHeight
            );

            /* —— place + scale —— */
            planLayer.style.left = canvasContainer.scrollLeft + "px";
            planLayer.style.top = canvasContainer.scrollTop + "px";
            planLayer.style.transformOrigin = "0 0";
            planLayer.style.transform = `scale(${scale})`;
            planLayer.style.display = "block";

            planLayer.classList.toggle(
                "ci-mode",
                body.classList.contains("ci-mode")
            );
        };
    });


    /* ===== helper — current slider value (clamped) ===== */
    function currentImgPx() {
        const px = parseInt(imgSizeInput.value, 10);
        return Math.max(1, Math.min(180, isNaN(px) ? 150 : px));
    }

    /* ===== shrink / restore every product card ===== */
    function resizeAllCards(enable) {
        const imgPx = currentImgPx();
        const tinyW = imgPx + 8;    // 4 px pad L/R
        const tinyH = imgPx + 14;   // 4 px top + 10 px bottom

        document.querySelectorAll("#canvas-content .canvas-item")
            .forEach(card => {
                if (!card.dataset.fullW) {           // remember full size once
                    card.dataset.fullW = card.style.width || card.offsetWidth + "px";
                    card.dataset.fullH = card.style.height || card.offsetHeight + "px";
                }
                if (enable) {
                    card.style.width = tinyW + "px";
                    card.style.height = tinyH + "px";
                } else {
                    card.style.width = card.dataset.fullW;
                    card.style.height = card.dataset.fullH;
                }
            });
        if (window.updateConnections) updateConnections();
    }

    /* ===== keep CSS var + live resize while slider moves ===== */
    function applyImgSize() {
        const px = currentImgPx();
        imgSizeInput.value = px;   // reflect clamp
        document.documentElement
            .style.setProperty("--ci-img-size", px + "px");
        if (body.classList.contains("ci-mode")) resizeAllCards(true);
    }
    imgSizeInput.addEventListener("input", applyImgSize);
    applyImgSize();   // initial 60 px

    /* ===== helper to keep blend‑modes & names ===== */
    function syncCards(on) {
        document.querySelectorAll("#canvas-content .canvas-item")
            .forEach(el => {
                el.classList.toggle("ci-mode", on);
                if (!on) {
                    el.style.mixBlendMode = "";
                    if (el.classList.contains("text-item"))
                        el.className = "canvas-item text-item";
                }
            });
    }

    /* ===== toggle handler ===== */
    function updateBody(ciOn) {
        /* existing stuff … */
        body.classList.toggle("ci-mode", ciOn);
        planLayer.classList.toggle("ci-mode", ciOn);
        imgSizeWrap.style.display = ciOn ? "inline-flex" : "none";
        if (ciOn) applyImgSize();
        resizeAllCards(ciOn);
        syncCards(ciOn);

        /* ---------- NEW : block dark‑mode while CI‑mode is on ---------- */
        const dmInput = document.getElementById("darkModeToggle"); // <input>
        const dmLabel = document.getElementById("dmLabel");        // <label> wrapper

        if (ciOn) {
            /* 1) visually switch back to light theme */
            body.classList.remove("dark-mode");
            dmInput.checked = false;

            /* 2) grey‑out & deactivate the toggle */
            dmInput.disabled = true;
            dmLabel.classList.add("btn-disabled");   // uses your grey style
        } else {
            /* re‑enable once CI‑mode is turned off */
            dmInput.disabled = false;
            dmLabel.classList.remove("btn-disabled");
        }
    }

    updateBody(toggle.checked);

    toggle.addEventListener("change", e => {
        if (e.target.checked) {                    // user tries to TURN ON
            e.preventDefault();                   // stop the automatic change
            toggle.checked = false;               // visual state back to OFF

            ciDialog.showModal();                 // ask first …
            ciProceed.onclick = () => {           // … continue?
                ciDialog.close();                 // hide pop‑up
                toggle.checked = true;            // finally flip the switch
                updateBody(true);                // ← your existing enable call
            };
            /* if the user clicks “Cancel” or presses ESC the <dialog>
               closes with value "cancel" ⇒ nothing happens            */
        } else {
            /* turning it OFF never needs confirmation */
            updateBody(false);                   // your normal disable path
        }
    });

});
