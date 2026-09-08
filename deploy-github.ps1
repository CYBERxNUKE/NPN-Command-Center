param([Parameter(Mandatory=$true)][string]$RepoUrl)
git init
git add .
git commit -m "Launch NPN Command Center"
git branch -M main
git remote add origin $RepoUrl
git push -u origin main
Write-Host "Pushed. In GitHub: Settings -> Pages -> Source = GitHub Actions"
