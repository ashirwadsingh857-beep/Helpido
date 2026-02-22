$url = "http://localhost:3000/api/tasks"
$body = @{
    title = "Test Task"
    description = "Testing radius check"
    postedBy = "1234567890"
    lat = 18.7394
    lng = 73.4312
    reward = 50
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Body $body
    Write-Host "Response:" $response.Content
} catch {
    Write-Host "Error:" $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body:" $responseBody
    }
}