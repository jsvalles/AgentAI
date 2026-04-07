# Script para iniciar servidor (usa variables de entorno desde .env)
Write-Host "Iniciando servidor..." -ForegroundColor Cyan

if (-not $env:ANTHROPIC_API_KEY) {
	Write-Host "ANTHROPIC_API_KEY no está definida en la sesión actual. Se intentará cargar desde .env" -ForegroundColor Yellow
}

Set-Location $PSScriptRoot
node server.js
