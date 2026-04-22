# Quickstart

## Frontend

```bash
cd "c:\Users\a895472\OneDrive - ATOS\Documents\Correos\dynamo-visual-console"
npm install
npm run dev
```

## Backend Spring Boot

```bash
cd "c:\Users\a895472\OneDrive - ATOS\Documents\Correos\dynamo-visual-console\backend"
$env:JAVA_HOME='C:\Program Files\Java\jdk-17'
$env:Path="C:\Program Files\Java\jdk-17\bin;" + $env:Path
mvn spring-boot:run
```

## Converter service

```bash
cd "c:\Users\a895472\OneDrive - ATOS\Documents\Correos\dynamo-visual-console\converter-service"
npm install
npm run dev
```

## AWS variables

```powershell
$env:DYNAMO_CONSOLE_API_KEY='change-me'
$env:DYNAMO_DESA_REGION='eu-west-1'
$env:DYNAMO_DESA_ACCESS_KEY='...'
$env:DYNAMO_DESA_SECRET_KEY='...'
$env:DYNAMO_PRE_REGION='eu-west-1'
$env:DYNAMO_PRE_ACCESS_KEY='...'
$env:DYNAMO_PRE_SECRET_KEY='...'
$env:DYNAMO_PRO_REGION='eu-west-1'
$env:DYNAMO_PRO_ACCESS_KEY='...'
$env:DYNAMO_PRO_SECRET_KEY='...'
```

If you want to use Localstack later, add `DYNAMO_*_ENDPOINT=http://localhost:4566` for the target environment.
