# STACKIT API Bruno Collection

This repository contains an automatically updated [Bruno](https://www.usebruno.com/) collection for the complete STACKIT API suite.

The collection syncs automatically with the latest STACKIT OpenAPI specifications from their GitHub repository via Actions. We've also baked in automated authentication scripts so you don't have to manually fetch tokens from the CLI.

## 📁 Structure
* **`stackit-prd/`**: Contains all public APIs directly synchronized from STACKIT.
* **`stackit-qa/`**: An untracked folder for your local, internal, or QA APIs. Adding APIs here locally will still inherit the root authentication!

## 🚀 Getting Started

1. **Install Bruno:** Download and install [Bruno](https://www.usebruno.com/downloads).
2. **Clone this repository:** `git clone https://github.com/jojomo96/stackit-bruno-collection`
3. **Open the collection:** Open Bruno, click **Open Collection**, and select the `stackit-collection` folder.

## 🔐 Authentication

This collection supports two types of authentication globally.

### Method 1: Standard User Account (OAuth2)
By default, the collection uses OAuth2 for your personal STACKIT account.

1. Select an endpoint and click **Send**.
2. Bruno opens your system browser. Log in with your STACKIT credentials.
3. Bruno captures the token automatically and handles refreshing it.

### Method 2: Service Account
If you need to authenticate using a Service Account, our pre-request script generates tokens automatically.

1. **Enable Developer Mode:** In Bruno Preferences, enable **Developer Mode**.
2. **Set the Environment Variable:** Create an environment and add a variable named `SERVICE_ACCOUNT_CONFIG`. Paste your full Service Account JSON key as the value.
3. **Switch Auth Type:** On your request or folder, change the Auth mode from `Inherit` to `Bearer Token`.
4. **Insert the Token:** Enter `{{STACKIT_ACCESS_TOKEN}}` in the Token field.

The root script will automatically generate a JWT, exchange it for an access token, save it, and execute your request. It refreshes automatically 30 seconds before expiry.