// Global counters and arrays.
let dotIdCounter = 0;
let cardIdCounter = 0;
let addedItems = []; // Holds { id, name, price } for each dropped item

// Global variable to track which product is being edited.
let currentEditIndex = null;

// Get references.
let floatingProductList;
let productListContent;
let canvasContainer;
let canvasContent;
let connectionLayer;
let deleteZone;
let priceListEl;
let totalPriceEl;

const GRID_SIZE = 10; // keep in sync with CSS background‑size
function snap(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

const roundTo10 = v => Math.ceil(v / GRID_SIZE) * GRID_SIZE; // size ↑

async function fetchProducts() {
    const body = {
        facets: {
            modelTypeName: [],
            brand: [],
            amplifierStreamingFeature: [],
            ampMultiroomPlatform: [],
            ampConnectionsWired: [],
            ampStreamingServices: [],
            color: [],
            amplifierTechnology: [],
            ampFeatures: []
        },
        constraints: {},
        pageSize: 50,
        sortBy: "MostPopular",
        outlet: "false",
        source: "Product Listing Page",
        query: "",
        page: 0,
        type: "category",
        currency: "DKK",
        locale: "da-DK",
        user: {
            classifications: {
                country: "dk"
            }
        }
    };
    console.log(body);

    try {
        const response = await fetch('http://localhost:3000/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log('Fetched data:', data);
        return data;
    } catch (error) {
        console.error('Error fetching products:', error);
        return null;
    }
}

//fetchProducts();

// Transformation function
function transformData(results) {
    if (!Array.isArray(results)) {
        console.error('Invalid input data for transformation');
        return [];
    }

    // Default additional fields
    const additionalFields = {
        inputs: [
            "HDMI ARC",
            "OPTICAL IN",
            "PHONO IN",
            "LINE IN"
        ],
        outputs: [
            "PRE OUT",
            "SPEAKER L/R"
        ],
        image: [
            "https://images.hifiklubben.com/image/aa399c7d-f4e6-44d6-8223-96d6f33ef952",
            "https://images.hifiklubben.com/image/537ec76f-70d0-43d9-bb02-1f9d52eeaa6f"
        ]
    };

    // Map each product and its variants to the new format
    return results.flatMap(product =>
        product.variants.map(variant => ({
            brand: product.brandName,
            name: product.modelName,
            sku: variant.sku,
            price: variant.priceDetails.price.toString(), // Convert price to string if needed
            ...additionalFields
        }))
    );
}

async function fetchedData() {
    const data = await fetchProducts();
    if (data && data.products && data.products.results) {
        const transformedData = transformData(data.products.results);
        console.log("Transformed Data:", transformedData);
        return transformedData; // Return the transformed data
    } else {
        console.error('Failed to fetch products or data structure is incorrect');
        return []; // Return an empty array in case of failure
    }
}

async function initializeProducts() {
    const transformedData = await fetchedData();
    console.log("Transformed Data:", transformedData);

    // Convert the transformed data to a string and then parse it back to an object
    const products = JSON.parse(JSON.stringify(transformedData, null, 2));
    console.log("Products:", products);

    // You can now use the `products` constant as needed
    return products;
}

//initializeProducts();

window.addEventListener("DOMContentLoaded", () => {
    floatingProductList = document.getElementById("floating-product-list");
    productListContent = floatingProductList.querySelector(".content");
    canvasContainer = document.getElementById("canvas-container");
    canvasContent = document.getElementById("canvas-content");
    connectionLayer = document.getElementById("connection-layer");
    deleteZone = document.getElementById("delete-zone");
    priceListEl = document.getElementById("price-list");
    totalPriceEl = document.getElementById("total-price");

    canvasContent.addEventListener("click", function(e) {
        if (isDrawing && (e.target === canvasContent || e.target === connectionLayer)) {
            endConnection(e);
            e.stopPropagation();
            e.preventDefault();
        } else if (isDrawing) {
            cancelConnection();
        }
    });

    const exportBtn = document.getElementById("export-btn");
    //exportBtn.addEventListener("click", darkModeToggle);


    // Handle drop events on the canvas container.
    canvasContainer.addEventListener("dragover", (event) => {
        event.preventDefault();
    });

    const MIN_CARD_W = 200; // don’t go smaller than the old fixed size
    function getCardWidth(product) {
        const GRID = GRID_SIZE; // same 10 px you already use for snapping
        const labels = [...(product.inputs || []), ...(product.outputs || [])];

        // quick‑n‑dirty text width estimate: 7 px per character at 10 px font
        const maxLabelPx = Math.max(0, ...labels.map(txt => txt.length * 5));

        // two columns of labels + a little breathing room in the middle
        const raw = maxLabelPx * 2 + 20; // 60 = 12 px dot + gaps etc.

        // respect minimum, then round up to nearest grid step
        return Math.ceil(Math.max(MIN_CARD_W, raw) / GRID) * GRID;
    }

    canvasContainer.addEventListener("drop", (event) => {
        event.preventDefault();
        let index = event.dataTransfer.getData("index");
        let product = products[index];
        let container = document.createElement("div");
        const cardW = getCardWidth(product); // << NEW
        container.style.width = cardW + "px"; // << NEW
        container.className = "canvas-item";
        container.dataset.cardId = cardIdCounter++;
        container.draggable = true;
        container.addEventListener("mousedown", dragMouseDown);

        // When creating a canvas item in the drop event listener:
        container.addEventListener("mousedown", function(e) {
            // Only add the effect if the target isn't an I/O dot or its label.
            if (!e.target.closest(".io-dot") && !e.target.closest(".io-label") && !e.target.closest(".canvas-item img")) {
                container.classList.add("canvas-item-click");
            }
        });

        // Remove the effect when the mouse is released.
        container.addEventListener("mouseup", function(e) {
            container.classList.remove("canvas-item-click");
        });

        //Add double-click event to delete the card with animation.
        container.addEventListener("dblclick", function(e) {
            // Prevent interfering with dragging.
            e.stopPropagation();
            animateRemoveCanvasItem(container);
        });

        // Create the content of the canvas item.
        let img = document.createElement("img");
        img.style.width = (cardW - 20) + "px"; // accounts for the 10 px padding left & right


        if (Array.isArray(product.image) && product.image.length > 0) {
            // Set the initial image source
            img.src = product.image[0];
            // Store the array of URLs
            img.imageArray = product.image;
            // Start at index 0
            img.currentIndex = 0;

            // Variables to track movement
            let startX = 0,
                startY = 0;
            let wasDragged = false;
            const DRAG_THRESHOLD = 0.5; // pixels

            // On mousedown, record the start position
            img.addEventListener("mousedown", function(event) {
                startX = event.clientX;
                startY = event.clientY;
                wasDragged = false;
            });

            // On mouseup, check if the pointer moved beyond the threshold
            img.addEventListener("mouseup", function(event) {
                let dx = Math.abs(event.clientX - startX);
                let dy = Math.abs(event.clientY - startY);
                if (dx < DRAG_THRESHOLD || dy < DRAG_THRESHOLD) {
                    wasDragged = true;
                }
            });

            // On click, only toggle if there was no significant dragging
            img.addEventListener("click", function(event) {
                // Stop propagation if needed
                event.stopPropagation();
                // If the image was dragged, do not toggle
                if (wasDragged) {
                    wasDragged = false; // reset for the next interaction
                    return;
                }
                // Otherwise, toggle the image source
                img.currentIndex = (img.currentIndex + 1) % img.imageArray.length;
                img.src = img.imageArray[img.currentIndex];
            });
        }

        img.src = product.image[0];
        img.array = product.image;
        img.currentIndex = 0;
        img.addEventListener("click", function(event) {
            event.stopPropagation();
            let arr = img.array;
            let idx = img.currentIndex;

            idx = (idx + 1) % arr.length;
            img.src = arr[idx];
            img.currentIndex = idx;
        });

        let name = document.createElement("div");
        name.className = "canvas-item-name";
        name.textContent = product.name;
        container.appendChild(img);
        container.appendChild(name);

        let ioContainer = document.createElement("div");
        ioContainer.className = "io-container";
        let inputsContainer = document.createElement("div");
        inputsContainer.className = "inputs";
        (product.inputs || []).forEach((input) => {
            inputsContainer.appendChild(createIODot("input", input));
        });
        let outputsContainer = document.createElement("div");
        outputsContainer.className = "outputs";
        (product.outputs || []).forEach((output) => {
            outputsContainer.appendChild(createIODot("output", output));
        });
        ioContainer.appendChild(inputsContainer);
        ioContainer.appendChild(outputsContainer);
        container.appendChild(ioContainer);

        container.addEventListener("click", function(e) {
            // If the click came from an I/O dot or its label, do nothing.
            if (e.target.closest(".io-dot") || e.target.closest(".io-label")) { /*Penis*/
                return;
            }
            container.classList.add("active");
            setTimeout(() => {
                container.classList.remove("active");
            }, 100);
        });

        // Append the container first to the DOM so that offsetWidth/offsetHeight are available.
        canvasContent.appendChild(container);
        container.style.height = roundTo10(container.offsetHeight) + "px";

        // Get the drop coordinates.
        const coords = getContentCoordinates(event);

        // Adjust the position to center the element at the cursor.
        container.style.left = snap(coords.x - container.offsetWidth / 2) + "px";
        container.style.top = snap(coords.y - container.offsetHeight / 2) + "px";

        // Update the price panel.
        addedItems.push({ id: container.dataset.cardId, name: product.name, price: parseFloat(product.price) });
        updatePricePanel();
    });

    // Export functionality.
    // Because the price panel is fixed (floating), it won't be captured when exporting canvasContainer.
    // So before export, we clone the price panel into the canvasContent as an absolutely positioned element.
    document.getElementById("export-btn").addEventListener("click", function() {
        const bg = getComputedStyle(canvasContainer).backgroundColor;
        canvasContainer.style.backgroundColor = bg;

        // Disable animations
        const canvasItems = document.querySelectorAll(".canvas-item");
        canvasItems.forEach(item => item.style.animation = "none");

        const pricePanel = document.getElementById("price-panel");
        const clonedPanel = pricePanel.cloneNode(true);
        // Compute the panel's position relative to canvasContent.
        const panelRect = pricePanel.getBoundingClientRect();
        const canvasContentRect = canvasContent.getBoundingClientRect();
        const relativeTop = panelRect.top - canvasContentRect.top;
        const relativeLeft = panelRect.left - canvasContentRect.left;
        clonedPanel.style.position = "absolute";
        clonedPanel.style.top = relativeTop + "px";
        clonedPanel.style.left = relativeLeft + "px";
        // Append the clone to canvasContent so it gets captured.
        canvasContent.appendChild(clonedPanel);

        html2canvas(canvasContainer, { useCORS: false, backgroundColor: null })
            .then(canvasExport => {
                canvasContainer.style.backgroundColor = "";
                clonedPanel.remove();
                let link = document.createElement("a");
                link.download = "HiFi Planner.png";
                link.href = canvasExport.toDataURL();
                link.click();
            });
    });

    canvasContainer.addEventListener("wheel", function(e) {
        const now = Date.now();
        if (now - lastWheelTime < throttleDelay) {
            e.preventDefault();
            return; // Skip this event if it's within the throttle delay.
        }
        lastWheelTime = now;

        e.preventDefault(); // Prevents the default scrolling behavior

        // Save the previous zoom value
        const prevZoom = zoom;

        // Update zoom factor based on the wheel delta
        if (e.deltaY < 0) {
            zoom *= 1.1;
        } else {
            zoom /= 1.1;
        }
        zoom = Math.max(0.1, Math.min(zoom, 10));

        // Calculate the center of the viewport (canvasContainer)
        const centerX = canvasContainer.scrollLeft + canvasContainer.clientWidth / 2;
        const centerY = canvasContainer.scrollTop + canvasContainer.clientHeight / 2;

        // Convert the viewport center to content coordinates (before zoom)
        const contentX = centerX / prevZoom;
        const contentY = centerY / prevZoom;

        // Apply the new scale transformation
        canvasContent.style.transform = `scale(${zoom})`;
        canvasContent.style.transformOrigin = "0 0";

        // Adjust the scroll to keep the center point fixed after zooming
        canvasContainer.scrollLeft = contentX * zoom - canvasContainer.clientWidth / 2;
        canvasContainer.scrollTop = contentY * zoom - canvasContainer.clientHeight / 2;
        var Center_y = contentY;
        var Center_x = contentX;
        updateConnections();
    });

    canvasContainer.addEventListener("mousedown", function(e) {
        if (!e.target.closest(".canvas-item")) {
            isPanning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            initialScrollLeft = canvasContainer.scrollLeft;
            initialScrollTop = canvasContainer.scrollTop;
            e.preventDefault();
            document.addEventListener("mousemove", panMove);
            document.addEventListener("mouseup", panEnd);
        }
    });

    // Toggle collapse for floating product list.
    const floatingHeader = floatingProductList.querySelector("header");
    floatingHeader.addEventListener("click", function() {

        const btn = document.getElementById("scrollBtn");
        if (floatingProductList.classList.contains("collapsed")) {
            floatingProductList.classList.remove("collapsed");
            floatingProductList.style.height = "";
            floatingHeader.querySelector(".toggle-icon").innerHTML = "&#x25B2;";
            btn.style.display = "block";
            // Optionally, re-check scroll position to show the button if needed.
            //btn.style.display = scrollEl.scrollTop > 20 ? "block" : "none";
        } else {
            floatingProductList.classList.add("collapsed");
            floatingProductList.style.height = "40px";
            floatingHeader.querySelector(".toggle-icon").innerHTML = "&#x25BC;";
            btn.style.display = "none";
        }
    });

    const toggle_price_btn = document.getElementById("toggle-price-panel-btn");
    const panel = document.getElementById("price-panel");
    panel.classList.add("hidden");

    toggle_price_btn.addEventListener("click", () => {
        panel.classList.toggle("hidden");
    });

    panel.classList.add("hidden");

    canvasContainer.addEventListener("click", function(e) {
        // Check if the clicked element is not inside a contentEditable element.
        if (!e.target.closest('[contenteditable="true"]')) {
            // If an editable element is focused, remove focus.
            if (document.activeElement && document.activeElement.isContentEditable) {
                document.activeElement.blur();
            }
        }
    });



    document.getElementById("add-text-btn").addEventListener("click", createTextCanvasItem);
});

function togglePricePanel() {
    const pricePanel = document.getElementById("price-panel");
    pricePanel.classList.toggle("hidden");
    console.log("Yuss");
}

document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
        // Your code here – for instance:
        cancelConnection();
    }

    if (e.key === "F1") {
        e.preventDefault();
        darkModeToggle();
    }

    if (e.key === "F3") {
        e.preventDefault();
        togglePricePanel();
    }

    if (e.key === "F4") {
        e.preventDefault(); // stop browser help panel
        exportBtn.click(); // trigger the click handler
        console.log(exportBtn);
    }
});

let isDrawing = false;
let selectedOutput = null;
let tempLine = null;
let connections = [];
let tempWaypoints = [];
let zoom = 1;
let zoom2 = 1;

const wireColors = [
    "#FF0000", // Red
    "#0000FF", // Blue
    "#00FF00", // Green
    "#FFFF00", // Yellow
    "#FF7F00", // Orange
    "#8B00FF", // Violet
    "#A52A2A", // Brown
    "#000000", // Black
    "#FFFFFF", // White
    "#00FFFF", // Cyan
    "#FFC0CB", // Pink
    "#808080", // Gray
    "#FFD700", // Gold
    "#C0C0C0", // Silver
    "#8B4513", // SaddleBrown
    "#228B22", // ForestGreen
    "#DC143C", // Crimson
    "#00008B", // DarkBlue
    "#FF1493", // DeepPink
    "#2E8B57" // SeaGreen
];

let lastColor = null;

function getNextRandomColor() {
    let color = wireColors[Math.floor(Math.random() * wireColors.length)];
    // If the new color is the same as the last one, pick again.
    // This loop will run only once in most cases.
    while (wireColors.length > 1 && color === lastColor) {
        color = wireColors[Math.floor(Math.random() * wireColors.length)];
    }
    lastColor = color;
    return color;
}

document.addEventListener('DOMContentLoaded', function() {
    const darkModeToggle = document.getElementById('darkModeToggle');

    darkModeToggle.addEventListener('change', function() {
        if (this.checked) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    });
});

document.addEventListener("DOMContentLoaded", function() {
    const helpBtn = document.getElementById("help-toggle-btn");
    const helpPanel = document.getElementById("help-content");

    if (helpPanel) {
        helpBtn.addEventListener("click", () => {
            const isVisible = helpPanel.style.display === "block";
            helpPanel.style.display = isVisible ? "none" : "block";
        });
    }
});



/**
 * Calculate a Manhattan (L-shaped) path between two points.
 */
function calculateManhattanPath(start, end, offset = 0) {
    const shouldGoVerticalFirst = Math.abs(end.y - start.y) > Math.abs(end.x + start.x);
    if (shouldGoVerticalFirst) {
        let midY = start.y + (end.y - start.y) / 2 + offset;
        return `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
    } else {
        let midX = start.x + (end.x - start.x) / 2 + offset;
        return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    }
}


// Create an I/O dot.
function createIODot(type, label) {
    const dot = document.createElement("div");
    dot.className = `io-dot ${type}-dot`;
    dot.dataset.type = type;
    dot.dataset.label = label;
    dot.dataset.id = dotIdCounter++;

    const labelEl = document.createElement("span");
    labelEl.className = `io-label ${type}-label`;
    labelEl.textContent = label;

    const container = document.createElement("div");
    container.style.position = "relative";
    container.appendChild(dot);
    container.appendChild(labelEl);

    // Stop propagation so the canvas item doesn't receive the mousedown.
    dot.addEventListener("mousedown", (e) => {
        e.stopPropagation();
    });

    // Optionally also stop click propagation if needed.
    dot.addEventListener("click", (e) => {
        e.stopPropagation();
        if (type === "output") {
            startConnection(e);
        } else {
            endConnection(e);
        }
    });

    return container;
}


// Convert event coordinates to canvas content coordinates.
function getContentCoordinates(event) {
    const rect = canvasContainer.getBoundingClientRect();
    const x = (event.clientX - rect.left + canvasContainer.scrollLeft) / zoom;
    const y = (event.clientY - rect.top + canvasContainer.scrollTop) / zoom;
    return { x, y };
}

// Get the center of an element in content coordinates.
function getIOPosition(element) {
    const rect = element.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();
    const x = (rect.left - containerRect.left + rect.width / 2 + canvasContainer.scrollLeft) / zoom;
    const y = (rect.top - containerRect.top + rect.height / 2 + canvasContainer.scrollTop) / zoom;
    return { x, y };
}

// --- Connection Drawing ---
function startConnection(event) {
    let removed = false;
    // Remove any existing connection from the clicked output.
    connections = connections.filter(conn => {
        if (conn.from === event.target) {
            conn.element.remove();
            if (conn.cableImg) {
                conn.cableImg.remove();
            }
            removed = true;
            return false; // Remove this connection.
        }
        return true;
    });

    if (removed) {
        updateConnections();
        updatePricePanel();
    }

    if (!isDrawing) {
        isDrawing = true;
        selectedOutput = event.target;
        tempWaypoints = [];
        tempLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempLine.classList.add("temp-connection");
        tempLine.setAttribute("pointer-events", "none");
        connectionLayer.appendChild(tempLine);
        canvasContainer.addEventListener("mousemove", updateTempLine);
    }
}

function updateTempLine(event) {
    if (isDrawing && tempLine) {
        const start = getIOPosition(selectedOutput);
        const current = getContentCoordinates(event);
        if (tempWaypoints.length === 0) {
            tempLine.setAttribute("d", calculateManhattanPath(start, current));
        } else {
            const pts = [start, ...tempWaypoints, current];
            const d = "M " + pts.map(p => `${p.x} ${p.y}`).join(" L ");
            tempLine.setAttribute("d", d);
        }
    }
}

function endConnection(event) {
    if (isDrawing && event.target.dataset.type === "input") {
        // Remove any existing connection from the same output.
        connections = connections.filter(conn => {
            if (conn.from === selectedOutput) {
                conn.element.remove();
                if (conn.cableImg) {
                    conn.cableImg.remove();
                }
                return false; // Remove this connection.
            }
            return true;
        });

        const start = getIOPosition(selectedOutput);
        const finish = getIOPosition(event.target);
        let d;
        if (tempWaypoints.length === 0) {
            d = calculateManhattanPath(start, finish);
        } else {
            const pts = [start, ...tempWaypoints, finish];
            d = "M " + pts.map(p => `${p.x} ${p.y}`).join(" L ");
        }
        const connection = document.createElementNS("http://www.w3.org/2000/svg", "path");
        connection.classList.add("connection");
        connection.setAttribute("d", d);
        connection.setAttribute("pointer-events", "all");
        const randomColor = getNextRandomColor();
        connection.style.stroke = randomColor;
        connectionLayer.appendChild(connection);
        connection.addEventListener("click", function(e) {
            e.stopPropagation();
            // Find the connection object corresponding to this SVG element.
            const connObj = connections.find(conn => conn.element === connection);
            if (connObj) {
                openCableSelectionModal(connObj);
            }
        });

        connections.push({
            element: connection,
            from: selectedOutput,
            to: event.target,
            offset: 0,
            fromCard: selectedOutput.closest(".canvas-item"),
            toCard: event.target.closest(".canvas-item")
        });
        updateConnections();
    }
    cancelConnection();
}

function openCableSelectionModal(connObj) {
    // Create a modal overlay.
    let modal = document.createElement("div");
    modal.className = "cable-selection-modal";
    Object.assign(modal.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: "2000"
    });

    // Close modal when clicking on the overlay (but not on its content)
    modal.addEventListener("click", function(event) {
        if (event.target === modal) {
            document.body.removeChild(modal);
        }
    });

    let modalContent = document.createElement("div");
    Object.assign(modalContent.style, {
        background: "#ffffff",
        padding: "20px",
        borderRadius: "8px",
        height: "80%",
        overflowY: "auto",
        width: "70vh"
    });

    let title = document.createElement("h3");
    title.textContent = "Select a Cable";
    modalContent.appendChild(title);

    // Create a search input field. penis
    let searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search cables...";
    searchInput.style.marginBottom = "10px";
    searchInput.style.width = "100%";
    searchInput.style.height = "40px";
    searchInput.style.borderRadius = "8px";
    searchInput.style.border = "#222222";
    modalContent.appendChild(searchInput);

    // Container for the cable items.
    let cablesContainer = document.createElement("div");
    modalContent.appendChild(cablesContainer);

    // Get all cable products.
    let cableProducts = products.filter(product => product.category === "Cable");

    // Define exclusion rules.
    // For example, when grouping by "RCA", exclude products that also have "Minijack",
    // and vice versa.
    const exclusionRules = {
        "RCA": ["Minijack"],
        "Minijack": ["RCA"]
    };

    // Render function to display grouped cable items with collapsible groups.
    function renderCableList() {
        cablesContainer.innerHTML = "";
        const searchTerm = searchInput.value.toLowerCase().trim();
        const searchWords = searchTerm.split(/\s+/).filter(Boolean);

        // First, filter the cables based on search.
        const filteredCables = cableProducts.filter(cable => {
            let combinedData = (cable.name + " " + cable.brand);
            if (cable.tags && Array.isArray(cable.tags)) {
                combinedData += " " + cable.tags.join(" ");
            }
            return searchWords.every(word => combinedData.toLowerCase().includes(word));
        });

        // Now, group the filtered cables by each connector tag.
        const groups = {};
        filteredCables.forEach(cable => {
            if (!cable.tags || !Array.isArray(cable.tags)) return;
            cable.tags.forEach(tag => {
                // Check the exclusion rule for this tag.
                if (exclusionRules[tag] && exclusionRules[tag].some(exTag => cable.tags.includes(exTag))) {
                    return; // Skip adding this cable for this tag.
                }
                // Initialize the group if needed.
                if (!groups[tag]) {
                    groups[tag] = [];
                }
                groups[tag].push(cable);
            });
        });

        let hasContent = false;
        // Render each group in alphabetical order.
        Object.keys(groups).sort().forEach(groupKey => {
            if (groups[groupKey].length > 0) {
                hasContent = true;

                // Create a container for this group.
                let groupContainer = document.createElement("div");
                groupContainer.style.marginBottom = "10px";

                // Create a collapsible header.
                let header = document.createElement("h4");
                header.textContent = groupKey;
                header.style.cursor = "pointer";
                header.style.background = "#eee";
                header.style.padding = "5px";
                header.style.margin = "0";

                // Create a container for the group's items.
                let contentContainer = document.createElement("div");
                contentContainer.style.padding = "5px 10px";
                // Set initial display state; change to "none" to have them closed by default.
                contentContainer.style.display = "none";

                // Toggle visibility when header is clicked.
                header.addEventListener("click", () => {
                    contentContainer.style.display =
                        contentContainer.style.display === "none" ? "block" : "none";
                });

                // Append each cable item to the content container.
                groups[groupKey].forEach(cable => {
                    let cableItem = document.createElement("div");
                    Object.assign(cableItem.style, {
                        border: "1px solid #ccc",
                        padding: "10px",
                        marginBottom: "5px",
                        cursor: "pointer"
                    });
                    cableItem.textContent = `${cable.brand} - ${cable.name} - ${cable.price},-`;
                    cableItem.addEventListener("click", function() {
                        // When the cable is selected, attach it to the connection.
                        connObj.cable = cable;
                        updateConnections();
                        updatePricePanel();
                        document.body.removeChild(modal);
                    });
                    contentContainer.appendChild(cableItem);
                });

                groupContainer.appendChild(header);
                groupContainer.appendChild(contentContainer);
                cablesContainer.appendChild(groupContainer);
            }
        });

        if (!hasContent) {
            let message = document.createElement("p");
            message.textContent = "No cable products available.";
            cablesContainer.appendChild(message);
        }
    }

    // Initial render and update as user types.
    renderCableList();
    searchInput.addEventListener("input", renderCableList);

    // Add a cancel button.
    let cancelButton = document.createElement("button");
    cancelButton.classList.add("button-16");
    cancelButton.textContent = "Cancel";
    cancelButton.style.marginTop = "10px";
    cancelButton.addEventListener("click", function() {
        document.body.removeChild(modal);
    });
    modalContent.appendChild(cancelButton);

    modal.appendChild(modalContent);
    document.body.appendChild(modal);
}

function cancelConnection() {
    if (tempLine) {
        tempLine.remove();
        tempLine = null;
    }
    isDrawing = false;
    selectedOutput = null;
    tempWaypoints = [];
    canvasContainer.removeEventListener("mousemove", updateTempLine);
    connections = connections.filter(conn => {
        if (conn.from === selectedOutput) {
            conn.element.remove();
            if (conn.cableImg) {
                conn.cableImg.remove();
            }
            return false; // Remove this connection.
        }
        return true;
    });
}



// Helper to compute the cable image’s position along the connection.
function getCableImagePosition(start, end, offset) {
    // Decide whether to go vertical first based on the differences.
    const vertical = Math.abs(end.y - start.y) > Math.abs(end.x - start.x);
    if (vertical) {
        // For vertical first: path is: start -> (start.x, midY) -> (end.x, midY) -> end.
        const midY = start.y + (end.y - start.y) / 2 + offset;
        const midX = (start.x + end.x) / 2;
        return { x: midX, y: midY };
    } else {
        // For horizontal first: path is: start -> (midX, start.y) -> (midX, end.y) -> end.
        const midX = start.x + 30;
        const midY = (start.y);
        return { x: midX, y: midY };
    }
}

// Update your updateConnections function:
function updateConnections() {
    const groups = {};
    connections.forEach(conn => {
        const fromId = conn.fromCard.dataset.cardId;
        const toId = conn.toCard.dataset.cardId;
        const key = `${fromId}_${toId}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(conn);
    });
    const spacing = 15;
    for (const key in groups) {
        const group = groups[key];
        const total = group.length;
        group.forEach((conn, index) => {
            const offset = (index - (total - 1) / 2) * spacing;
            conn.offset = offset;
            const start = getIOPosition(conn.from);
            const end = getIOPosition(conn.to);
            conn.element.setAttribute("d", calculateManhattanPath(start, end, offset));

            // --- Cable image handling ---
            if (conn.cable) {
                const pos = getCableImagePosition(start, end, offset);
                const imgSize = 20; // Adjust as needed
                if (!conn.cableImg) {
                    // Create an SVG image element if one doesn't exist yet.
                    conn.cableImg = document.createElementNS("http://www.w3.org/2000/svg", "image");
                    conn.cableImg.setAttribute("width", imgSize);
                    conn.cableImg.setAttribute("height", imgSize);
                    // Prevent the image from interfering with mouse events.
                    conn.cableImg.style.pointerEvents = "none";
                    connectionLayer.appendChild(conn.cableImg);
                }
                // Set the cable image and position.
                conn.cableImg.setAttribute("href", conn.cable.image);
                conn.cableImg.setAttribute("x", pos.x - imgSize / 2);
                conn.cableImg.setAttribute("y", pos.y - imgSize / 2);
            } else {
                // Remove any previously added cable image if no cable is selected.
                if (conn.cableImg) {
                    conn.cableImg.remove();
                    conn.cableImg = null;
                }
            }

            // --- Tooltip handling ---
            if (conn.cable) {
                // If a cable is attached, add/update the <title> element.
                let titleEl = conn.element.querySelector("title");
                if (!titleEl) {
                    titleEl = document.createElementNS("http://www.w3.org/2000/svg", "title");
                    conn.element.appendChild(titleEl);
                }
                titleEl.textContent = conn.cable.name;
            } else {
                // Remove any existing title element if no cable is attached.
                let titleEl = conn.element.querySelector("title");
                if (titleEl) {
                    titleEl.remove();
                }
            }
        });
    }
}

// ----- Load Products with Filters and Edit Button -----
function loadProducts() {
    // Create a container for the search input
    const searchContainer = document.createElement("div");
    searchContainer.id = "searchbar-container";
    // Make it sticky so it always remains at the top of the floating list
    searchContainer.style.position = "sticky";
    searchContainer.style.top = "0";
    searchContainer.style.border = "none";
    searchContainer.style.zIndex = "100";
    searchContainer.style.padding = "0px"; // adjust as needed
    searchContainer.style.backgroundColor = "white";
    searchContainer.style.alignContent = "center";
    searchContainer.style.display = "flex";
    searchContainer.style.justifyContent = "center";
    searchContainer.style.alignItems = "center";
    searchContainer.style.marginTop = "0vh";
    searchContainer.style.boxShadow = "0px -20px 0px 20px white";

    // Create the search input
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.id = "search-input";
    searchInput.placeholder = "Search products by name";
    searchInput.style.border = "1px solid var(--border-color)"; // custom border
    searchInput.style.borderRadius = "4px";
    searchInput.style.padding = "8px 10px";
    searchInput.style.fontSize = "16px";
    searchInput.style.width = "100%"; // or any width you prefer
    searchInput.style.outline = "none";
    searchInput.style.backgroundColor = "#fff"; // adjust if needed
    searchInput.style.color = "#333"; // adjust text color if needed
    searchContainer.appendChild(searchInput);

    // Append the search container to your product list container
    productListContent.appendChild(searchContainer);

    // Create the filter container for additional filters
    const filterContainer = document.createElement("div");
    filterContainer.id = "filter-container";
    filterContainer.style.display = "flex";
    filterContainer.style.flexDirection = "column";
    filterContainer.style.gap = "5px";
    filterContainer.style.marginBottom = "10px";

    const collapsibleHeader = document.createElement("div");
    collapsibleHeader.className = "collapsible-header button-17";
    collapsibleHeader.textContent = "Additional Filters \u25BC";

    const collapsibleContent = document.createElement("div");
    collapsibleContent.className = "collapsible-content";

    const brandSelect = document.createElement("select");
    brandSelect.id = "brand-select";
    const allBrandsOption = document.createElement("option");
    allBrandsOption.value = "";
    allBrandsOption.textContent = "All Brands";
    brandSelect.appendChild(allBrandsOption);
    const brands = [...new Set(products.map(product => product.brand))];
    brands.forEach(brand => {
        const option = document.createElement("option");
        option.value = brand;
        option.textContent = brand;
        brandSelect.appendChild(option);
    });
    collapsibleContent.appendChild(brandSelect);

    const minPriceInput = document.createElement("input");
    minPriceInput.type = "number";
    minPriceInput.id = "min-price";
    minPriceInput.placeholder = "Min Price";
    collapsibleContent.appendChild(minPriceInput);

    const maxPriceInput = document.createElement("input");
    maxPriceInput.type = "number";
    maxPriceInput.id = "max-price";
    maxPriceInput.placeholder = "Max Price";
    collapsibleContent.appendChild(maxPriceInput);

    const inputFilter = document.createElement("input");
    inputFilter.type = "text";
    inputFilter.id = "input-filter";
    inputFilter.placeholder = "Filter by Input type";
    collapsibleContent.appendChild(inputFilter);

    const outputFilter = document.createElement("input");
    outputFilter.type = "text";
    outputFilter.id = "output-filter";
    outputFilter.placeholder = "Filter by Output type";
    collapsibleContent.appendChild(outputFilter);

    filterContainer.appendChild(collapsibleHeader);
    filterContainer.appendChild(collapsibleContent);
    // productListContent.appendChild(filterContainer);

    // Create container for product items
    const productItems = document.createElement("div");
    productItems.id = "product-items";
    productListContent.appendChild(productItems);

    let renderToken = 0; // Global token to track the current render
    let productsAmount_before = 0;

    function updateProductList() {
        console.log("updating product list");
        // Increase the token each time we start a new render.
        renderToken++;
        const token = renderToken; // Capture the current token value

        const searchTerm = searchInput.value.toLowerCase().trim();
        const searchWords = searchTerm.split(/\s+/).filter(Boolean);
        const selectedBrand = brandSelect.value;
        const minPrice = parseFloat(minPriceInput.value) || 0;
        const maxPrice = parseFloat(maxPriceInput.value) || Infinity;
        const inputTerm = inputFilter.value.toLowerCase().trim();
        const outputTerm = outputFilter.value.toLowerCase().trim();

        //productItems.innerHTML = "";

        let productsAmount_after = 0;
        const childs = Array.from(productItems.children);

        for (const product of products) {
            // Check if a new input event has occurred by comparing tokens.
            if (token !== renderToken) {
                console.log("Render aborted due to new input");
                return; // Abort this render loop.
            }

            // Exclude cable products.
            //if (product.category && product.category.toLowerCase() === "cable") {
            //    continue;
            //};

            if (product.category) {
                // If it's an array, check if any element matches "cable"
                if (Array.isArray(product.category)) {
                    if (product.category.some(cat => cat.toLowerCase() === "cable")) continue;
                } else if (product.category.toLowerCase() === "cable") {
                    continue;
                }
            }


            const combinedData = (
                product.name + " " +
                product.brand + " " +
                product.sku + " " +
                product.category + " " +
                (product.inputs || []).join(" ") + " " +
                (product.outputs || []).join(" ")
            ).toLowerCase();

            const matchesSearch = searchWords.every(word => combinedData.includes(word));

            if (!matchesSearch) {
                childs.find(o => o.dataset.index == products.indexOf(product)).classList.add("hidden-product");
                continue;
            };
            if (selectedBrand && product.brand !== selectedBrand) {
                childs.find(o => o.dataset.index == products.indexOf(product)).classList.add("hidden-product");
                continue;
            };

            const priceNum = parseFloat(product.price);
            if (priceNum < minPrice || priceNum > maxPrice) {
                childs.find(o => o.dataset.index == products.indexOf(product)).classList.add("hidden-product");
                continue;
            };
            if (inputTerm && !(product.inputs || []).some(i => i.toLowerCase().includes(inputTerm))) {
                childs.find(o => o.dataset.index == products.indexOf(product)).classList.add("hidden-product");
                continue;
            };
            if (outputTerm && !(product.outputs || []).some(o => o.toLowerCase().includes(outputTerm))) {
                childs.find(o => o.dataset.index == products.indexOf(product)).classList.add("hidden-product");
                continue;
            };

            childs.find(o => o.dataset.index == products.indexOf(product)).classList.remove("hidden-product");

            //productItems.children[].classList.remove("hidden-product");

            // Create product element.


            productsAmount_after++;

            // Optionally, update the product count incrementally if desired.
            //document.getElementById("productsLabel").innerHTML = `Products (${productsAmount_after})`;

        }

        // Final update if needed.
        productsAmountAnimation(productsAmount_after);
        productsAmount_before = productsAmount_after;
        console.log("Products displayed:", productsAmount_after);
        console.log("Products displayed:", productsAmount_before);
    }

    function renderProductList() {
        console.log("rendering product list");

        // Increase the token each time we start a new render.
        renderToken++;
        const token = renderToken; // Capture the current token value

        const searchTerm = searchInput.value.toLowerCase().trim();
        const searchWords = searchTerm.split(/\s+/).filter(Boolean);
        const selectedBrand = brandSelect.value;
        const minPrice = parseFloat(minPriceInput.value) || 0;
        const maxPrice = parseFloat(maxPriceInput.value) || Infinity;
        const inputTerm = inputFilter.value.toLowerCase().trim();
        const outputTerm = outputFilter.value.toLowerCase().trim();

        productItems.innerHTML = "";

        let productsAmount_after = 0;

        for (const product of products) {
            // Check if a new input event has occurred by comparing tokens.
            if (token !== renderToken) {
                console.log("Render aborted due to new input");
                return; // Abort this render loop.
            }

            // Exclude cable products.
            //if (product.category && product.category.toLowerCase() === "cable") continue;
            if (product.category) {
                // If it's an array, check if any element matches "cable"
                if (Array.isArray(product.category)) {
                    if (product.category.some(cat => cat.toLowerCase() === "cable")) continue;
                } else if (product.category.toLowerCase() === "cable") {
                    continue;
                }
            }

            const combinedData = (
                product.name + " " +
                product.brand + " " +
                product.sku + " " +
                product.category + " " +
                (product.inputs || []).join(" ") + " " +
                (product.outputs || []).join(" ")
            ).toLowerCase();

            const matchesSearch = searchWords.every(word => combinedData.includes(word));

            if (!matchesSearch) continue;
            if (selectedBrand && product.brand !== selectedBrand) continue;

            const priceNum = parseFloat(product.price);
            if (priceNum < minPrice || priceNum > maxPrice) continue;
            if (inputTerm && !(product.inputs || []).some(i => i.toLowerCase().includes(inputTerm))) continue;
            if (outputTerm && !(product.outputs || []).some(o => o.toLowerCase().includes(outputTerm))) continue;

            // Create product element.
            let item = document.createElement("div");
            item.className = "product";
            item.draggable = true;
            item.innerHTML = `<img draggable="false" src="${product.image[0]}" alt="${product.name}"><br><strong>${product.name}</strong>`;
            item.dataset.index = products.indexOf(product);
            item.addEventListener("dragstart", dragStart);
            productItems.appendChild(item);

            productsAmount_after++;

            // Optionally, update the product count incrementally if desired.
            //document.getElementById("productsLabel").innerHTML = `Products (${productsAmount_after})`;

        }

        // Final update if needed.
        productsAmountAnimation(productsAmount_after);
        productsAmount_before = productsAmount_after;
        console.log("Products displayed:", productsAmount_after);
        console.log("Products displayed:", productsAmount_before);
    }

    function lerp(a, b, alpha) {
        return a + alpha * (b - a);
    }

    function easeInOutElastic(x) {
        const c5 = (2 * Math.PI) / 4.5;

        return x === 0 ?
            0 :
            x === 1 ?
            1 :
            x < 0.5 ?
            -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2 :
            (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1;
    }

    function easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
    }

    function easeInOutQuart(x) {
        return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
    }

    let animation_id;
    let animation_value = 0;
    let animation_target = 0;

    function productsAmountAnimation(to) {
        animation_target = to;

        if (animation_id) {
            return;
        }

        animation_id = setInterval(() => {
            var delta = Math.abs(animation_value - animation_target);

            animation_value = lerp(animation_value, animation_target, delta > 5 ? 0.15 : 0.05);
            document.getElementById("productsLabel").innerHTML = `Products: ${Math.round(animation_value)}`;

            if (delta < 0.4) {
                clearInterval(animation_id);
                animation_id = undefined;
            }
        }, 16);

        return;
        // OLD
        const start = performance.now();
        const animLength = 1000;

        if (animation_id) {
            clearInterval(animation_id);
        }

        animation_id = setInterval(() => {
            const alpha = (performance.now() - start) / animLength;

            animation_value = Math.round(lerp(animation_value, to, easeInOutQuart(Math.min(1, alpha))));

            document.getElementById("productsLabel").innerHTML = `Products (${animation_value})`;

            if (alpha >= 1) {
                clearInterval(animation_id);
                animation_id = undefined;
            }
        }, 16);

    }

    // Debounce the input to avoid rapid re-calls.
    function debounce(fn, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                fn.apply(this, args);
            }, delay);
        };
    }

    const debouncedRender = debounce(updateProductList, 0);

    searchInput.addEventListener("input", debouncedRender);

    // Optional: if you want to trigger on Enter as well:
    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            // Cancel the debounced call if needed
            debouncedRender.cancel && debouncedRender.cancel();
            updateProductList();
        }
    });
    renderProductList();
};

function dragStart(event) {
    event.dataTransfer.setData("index", event.target.dataset.index);
}



// Helper: Animate removal by scaling down quickly.
function animateRemoveCanvasItem(item) {
    // Apply a quick transition for transform and opacity.
    item.style.transition = "transform 0.1s ease-out, opacity 0.1s ease-out";
    item.style.transform = "opacity(0)";
    item.style.opacity = "0";
    // Once the transition is done, remove the item.
    item.addEventListener("transitionend", () => {
        removeCanvasItem(item);
    });
}



function dragMouseDown(event) {
    event.preventDefault();
    let element = event.target.closest(".canvas-item");
    const startCoords = getContentCoordinates(event);
    const currentLeft = parseFloat(element.style.left) || 0;
    const currentTop = parseFloat(element.style.top) || 0;
    let offsetX = startCoords.x - currentLeft;
    let offsetY = startCoords.y - currentTop;

    function moveElement(e) {
        const newCoords = getContentCoordinates(e);

        // Snap the tentative x/y to the grid before applying them
        element.style.left = snap(newCoords.x - offsetX) + "px";
        element.style.top = snap(newCoords.y - offsetY) + "px";

        updateConnections();
    }

    function removeListeners(e) {
        document.removeEventListener("mousemove", moveElement);
        document.removeEventListener("mouseup", removeListeners);
    }

    document.addEventListener("mousemove", moveElement);
    document.addEventListener("mouseup", removeListeners);
}

function removeCanvasItem(item) {
    // Remove any connection linked to this item.
    connections = connections.filter((conn) => {
        if (item.contains(conn.from) || item.contains(conn.to)) {
            conn.element.remove();
            if (conn.cableImg) {
                conn.cableImg.remove();
            }
            return false; // Remove this connection from the array.
        }
        return true;
    });
    // Remove the item's price from the addedItems list.
    const id = item.dataset.cardId;
    addedItems = addedItems.filter(i => i.id !== id);
    updatePricePanel();
    item.remove();
}

// Update the price panel list and total.
function updatePricePanel() {
    priceListEl.innerHTML = "";
    let total = 0;

    // List prices of dropped items.
    addedItems.forEach(item => {
        let li = document.createElement("li");
        li.textContent = `${item.name}: ${item.price},-`;
        priceListEl.appendChild(li);
        total += item.price;
    });

    // Also include cable prices from connections.
    connections.forEach(conn => {
        if (conn.cable) {
            let li = document.createElement("li");
            li.textContent = `${conn.cable.name} (Cable): ${conn.cable.price},-`;
            priceListEl.appendChild(li);
            total += parseFloat(conn.cable.price);
        }
    });

    totalPriceEl.textContent = `Total: ${total},-`;
}

function initConnectionLayer() {
    connectionLayer.setAttribute("width", canvasContent.clientWidth);
    connectionLayer.setAttribute("height", canvasContent.clientHeight);
}



let lastWheelTime = 0;
const throttleDelay = 10; // milliseconds





// ----- Panning functionality -----
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let initialScrollLeft = 0;
let initialScrollTop = 0;



function panMove(e) {
    if (!isPanning) return;
    const dx = e.clientX - panStartX;
    const dy = e.clientY - panStartY;
    canvasContainer.scrollLeft = initialScrollLeft - dx;
    canvasContainer.scrollTop = initialScrollTop - dy;
}

function panEnd(e) {
    isPanning = false;
    document.removeEventListener("mousemove", panMove);
    document.removeEventListener("mouseup", panEnd);
}




window.addEventListener("load", () => {
    loadProducts();
    initConnectionLayer();


    // 1) Initialize OverlayScrollbars
    const osInstance = OverlayScrollbarsGlobal.OverlayScrollbars(document.querySelector('.content'), {
        scrollbars: { theme: 'os-theme-dark' }
    });

    // 2) Grab the viewport and attach your listener
    // Define the logistic curve outside the listener for clarity/performance:
    function logisticCurve(x) {
        // L is the maximum (500).
        // k is the steepness (10).
        // x0 is the midpoint (0.5).
        const L = 500;
        const k = 7;
        const x0 = 0.8;

        // Logistic formula => 0..L
        return L / (1 + Math.exp(-k * (x - x0)));
    }

    // Example usage inside your scroll listener:
    const scrollEl = osInstance.elements().viewport;
    scrollEl.addEventListener("scroll", () => {
        const btn = document.getElementById("scrollBtn");

        // Let's say your scrollable area goes from 0 to 1000 pixels.
        // We normalize scrollTop into [0..1].
        const scrollMax = 1000; // Adjust as needed
        let x = scrollEl.scrollTop / scrollMax;
        // Clamp x so it never exceeds [0..1].
        if (x < 0) x = 0;
        if (x > 1) x = 1;

        // logisticVal is 0..500
        const logisticVal = logisticCurve(x);

        // Now map that 0..500 into 0..1 for opacity
        btn.style.opacity = logisticVal / 500;

        // Decide whether you want the button hidden if near zero, etc.
        // For example, hide it completely if it's extremely low:
        if (btn.style.opacity < 0.01) {
            btn.style.display = "none";
        } else {
            btn.style.display = "block";
        }
    });


    // 3) Provide a scrollToTop function
    window.scrollToTop = function() {
        scrollEl.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    };
})
window.addEventListener("resize", initConnectionLayer);

const roundToGrid = value => Math.ceil(value / GRID_SIZE) * GRID_SIZE;

function snapTextCardSize(el) {
    el.style.width = roundToGrid(el.offsetWidth) + "px";
    el.style.height = roundToGrid(el.offsetHeight) + "px";
}

function createTextCanvasItem() {
    // Create the main container.
    const container = document.createElement("div");
    container.className = "canvas-item text-item";

    // Create the drag handle area.
    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "";

    // Create the text content area.
    const textArea = document.createElement("div");
    textArea.className = "text-content";

    // Create an editable title.
    const title = document.createElement("h3");
    title.contentEditable = true;
    title.textContent = "Title";
    title.spellcheck = false;
    title.style.margin = "0";
    title.style.outline = "none";
    title.classList.add("placeholder");

    dragHandle.addEventListener("mouseup", () => snapTextCardSize(container));
    container.addEventListener("mouseup", () => snapTextCardSize(container));

    // Add focus and blur events for placeholder behavior.
    title.addEventListener("focus", () => {
        if (title.textContent === "Title") {
            title.textContent = "";
            title.classList.remove("placeholder");
        }
    });

    title.addEventListener("blur", () => {
        if (title.textContent.trim() === "") {
            title.textContent = "Title";
            title.classList.add("placeholder");
        }
    });

    // Create an editable paragraph.
    const paragraph = document.createElement("p");
    paragraph.contentEditable = true;
    paragraph.textContent = "Write something...";
    paragraph.spellcheck = false;
    paragraph.style.outline = "none";
    paragraph.classList.add("placeholder");

    // Add placeholder-like behavior to the paragraph.
    paragraph.addEventListener("focus", () => {
        if (paragraph.textContent === "Write something...") {
            paragraph.textContent = "";
            paragraph.classList.remove("placeholder");
        }
    });
    paragraph.addEventListener("blur", () => {
        if (paragraph.textContent.trim() === "") {
            paragraph.textContent = "Write something...";
            paragraph.classList.add("placeholder");
        }
    });

    // Append the drag handle and text area to the main container.
    container.appendChild(dragHandle);
    container.appendChild(textArea);

    // Append title and paragraph to the text area.
    textArea.appendChild(title);
    textArea.appendChild(paragraph);

    // Make only the drag handle the draggable area.
    dragHandle.addEventListener("mousedown", dragMouseDown);

    // Allow dblclick on the container to remove it.
    container.addEventListener("dblclick", function(e) {
        e.stopPropagation();
        animateRemoveCanvasItem(container);
    });

    // Set some default styling.
    container.style.width = "250px";
    container.style.padding = "0"; // We'll manage padding in each sub-element.

    // Append the container to canvasContent first so we can measure it.
    canvasContent.appendChild(container);

    container.style.width = roundToGrid(container.offsetWidth) + "px";
    container.style.height = roundToGrid(container.offsetHeight) + "px";

    // Compute the center in content coordinates.
    const centerX = (canvasContainer.scrollLeft + (canvasContainer.clientWidth * 1.5) / 2) / zoom;
    const centerY = (canvasContainer.scrollTop + (canvasContainer.clientHeight * 1.5) / 2) / zoom;

    // Adjust the container position to center it.
    container.style.left = (centerX - container.offsetWidth / 2) + "px";
    container.style.top = (centerY - container.offsetHeight / 2) + "px";
}

window.addEventListener("load", () => {
    canvasContainer.scrollLeft = (canvasContent.offsetWidth - canvasContainer.clientWidth) / 2;
    canvasContainer.scrollTop = (canvasContent.offsetHeight - canvasContainer.clientHeight) / 2;
});

document.addEventListener('DOMContentLoaded', function() {
    OverlayScrollbars(document.getElementById("help-content"), {
        scrollbars: {
            theme: "os-theme-dark"
        }
    });
});

document.addEventListener('DOMContentLoaded', function() {
    /* ===== configuration ===== */
    const VALID_USERNAMES = [
        "442",
        "422",
        "415",
        "421",
        "418",
        "411",
        "424",
        "428",
        "438",
        "426",
        "412",
        "409",
        "433",
        "401"
    ];
    /* ===== DOM refs ===== */
    const overlay = document.getElementById("login-overlay");
    const input = document.getElementById("username");
    const btn = document.getElementById("submit-btn");
    const errorBox = document.getElementById("error");

    /* ===== logic ===== */
    function unlockSite() {
        // remove the overlay node so nothing underneath is blocked
        overlay.remove();
        const searchInput = document.getElementById("search-input");
        if (searchInput) searchInput.focus(); // caret jumps now
    }

    function checkLogin() {
        const val = input.value.trim(); // what the visitor typed
        if (VALID_USERNAMES.includes(val)) { // ✅ is it one of ours?
            unlockSite();
        } else {
            errorBox.textContent = "Invalid.";
            input.focus();
        }
    }

    /* ===== wire events ===== */
    btn.addEventListener("click", checkLogin);
    input.addEventListener("keydown", e => { if (e.key === "Enter") checkLogin(); });
});