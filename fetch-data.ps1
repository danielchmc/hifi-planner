$body = @{
    facets      = @{
        modelTypeName             = @()
        brand                     = @()
        amplifierStreamingFeature = @()
        ampMultiroomPlatform      = @()
        ampConnectionsWired       = @()
        ampStreamingServices      = @()
        color                     = @()
        amplifierTechnology       = @()
        ampFeatures               = @()
    }
    constraints = @{ 
        #modelType = @(
        #    "PowerAmplifier"
        #    "IntegratedAmplifier"
        #    "Receiver"
        #    "PreAmplifier"
        #    "MultiRoomAmplifier"
        #    "DigitalAmplifier"
        #    "WirelesSamplifier"
        #    "Musicsystemwithstreaming"
        #    "Stereoamplifierwithstreaming"
        #    "Musicsystem"
        #    "PowerAmplifierInstallation"
        #    "MultiChannelPowerAmplifier")
    }
    pageSize    = 50
    sortBy      = "MostPopular"
    outlet      = "false"
    source      = "Product Listing Page"
    query       = ""
    page        = 0
    type        = "category"
    currency    = "DKK"
    locale      = "da-DK"
    user        = @{ 
        classifications = @{
            country = "dk" 
        } 
    }
}

$count = 0

while ($true) {
    $json = ConvertTo-Json $body

    $response = Invoke-WebRequest -UseBasicParsing -Uri "https://www.hifiklubben.dk/_search" -Method "POST" -ContentType "application/json" -Body $json
    
    $responseJson = ConvertFrom-Json $response.Content;
    
    $products = $responseJson.products.results;
    
    foreach ($product in $products) {
        if ($product.outletOnly -eq "False") {
            Write-Host $product.outletOnly
            continue;
        }

        $data = @{
            brand = $product.brandName
            model = $product.modelName
            sku = $product.skuCode
            variants = @()
        }

        foreach ($variant in $product.variants) {
            $data.variants += @{
                sku = $variant.sku
                price = @{
                    unit = $variant.priceDetails.rawSalesUnit
                    price = $variant.priceDetails.price
                }
            }
        }

        ConvertTo-Json -Depth 3 -Compress $data | Add-Content -Path "bruh2.txt"
    }

    $count += $products.length

    if ($products.length -lt 50) {
        break;
    }

    $body.page += 1;
    
}

Write-Host $count


#$response.Content | Out-File "data.json"

#Write-Host $response.Content