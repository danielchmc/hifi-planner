async function fetchProducts() {
    // Initialize the request payload
    let body = {
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
  
    let count = 0;
    let productsCollected = [];
    let hasMorePages = true;
  
    while (hasMorePages) {
      // Send the POST request with the current payload
      const response = await fetch("https://www.hifiklubben.dk/_search", {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
  
      if (!response.ok) {
        console.error("Network response was not ok:", response.statusText);
        break;
      }
  
      const responseJson = await response.json();
      const products = responseJson.products.results;
  
      // Process each product
      products.forEach(product => {
        // If outletOnly equals "False", log it and skip processing this product
        if (product.outletOnly === "False") {
          console.log(product.outletOnly);
          return;
        }
  
        // Build a new object for the product data
        let data = {
          brand: product.brandName,
          model: product.modelName,
          sku: product.skuCode,
          variants: []
        };
  
        // Process the variants array for each product
        product.variants.forEach(variant => {
          data.variants.push({
            sku: variant.sku,
            price: {
              unit: variant.priceDetails.rawSalesUnit,
              unit_2: variant.priceDetails.salesUnit,
              price: variant.priceDetails.price
            }
          });
        });

      
        productsCollected.push(data);
      });
  
      count += products.length;
  
      // If fewer than 50 products are returned, assume we've reached the last page
      if (products.length < 50) {
        hasMorePages = false;
      } else {
        // Move to the next page
        body.page += 1;
      }
    }
  
    console.log("Total products processed:", count);
    console.log("Collected products:", productsCollected);
  
    // You can now use `productsCollected` to render on your website or for further processing
    return productsCollected;
  }
  
  // Call the function (for example, on page load or on a button click)
  fetchProducts().catch(error => console.error("Error fetching products:", error));  