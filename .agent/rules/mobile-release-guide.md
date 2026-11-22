# eParchi Android Release & Google Play Store Preparation Guide

## 1. Application Identity

- **Application Name:** eParchi
- **Android Package ID:** `com.eparchi.app`
- **Version Name:** `1.0.0`
- **Version Code:** `1`
- **Target SDK:** Android 15 (API level 35) / Minimum SDK: Android 7.0 (API level 24)
- **Architecture:** React Native 0.76 + Expo SDK 52 + New Architecture Enabled

---

## 2. Configuration Files

### 2.1 `app.json`
Configured with:
- Custom scheme `eparchi://`
- Adaptive launcher icons in `assets/adaptive-icon.png` on `#0F766E` background
- Splash screen with vector receipt badge on `#0F766E` canvas
- Android Permissions:
  - `android.permission.INTERNET`
  - `android.permission.READ_EXTERNAL_STORAGE`
  - `android.permission.WRITE_EXTERNAL_STORAGE`
- Hardware-backed biometric & KeyStore permissions via `expo-secure-store`

### 2.2 `eas.json`
Profiles:
- `development`: Development client build
- `preview`: Standalone APK (`.apk`) for direct sideloading and internal QA testing on physical Android devices
- `production`: Optimized Android App Bundle (`.aab`) signed for Google Play Store production track

---

## 3. Build & Distribution Commands

### 3.1 Cloud Build with EAS (Recommended)
1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Authenticate with Expo account:
   ```bash
   eas login
   ```
3. Build Internal Testing APK (Direct Installation):
   ```bash
   cd mobile
   eas build --platform android --profile preview
   ```
4. Build Production Google Play Store App Bundle (`.aab`):
   ```bash
   cd mobile
   eas build --platform android --profile production
   ```

### 3.2 Local Native Build (Alternative without EAS)
1. Generate native Android Gradle project:
   ```bash
   cd mobile
   npx expo prebuild --platform android
   ```
2. Build Release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
3. Build Release App Bundle:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Artifact will be output to: `android/app/build/outputs/bundle/release/app-release.aab`.

---

## 4. Keystore & Release Signing

For manual signing:
```bash
keytool -genkeypair -v -keystore eparchi-release-key.keystore -alias eparchi-key-alias -keyalg RSA -keysize 2048 -validity 10000
```
Add to `android/gradle.properties`:
```properties
EPARCHI_RELEASE_STORE_FILE=eparchi-release-key.keystore
EPARCHI_RELEASE_KEY_ALIAS=eparchi-key-alias
EPARCHI_RELEASE_STORE_PASSWORD=*****
EPARCHI_RELEASE_KEY_PASSWORD=*****
```

When building with EAS, EAS automatically generates and safely stores the production upload keystore in encrypted cloud KMS.

---

## 5. Google Play Store Console Declarations

### 5.1 Data Safety Section
- **Personal Info:** Name, Email address (for account setup and staff authorization).
- **Financial Info:** Bill totals, transaction payment modes (for digital receipt record-keeping).
- **Contact Info:** Client Name, Phone number (entered voluntarily by business owner for billing and WhatsApp receipt delivery).
- **Data Security:**
  - Data encrypted in transit using TLS 1.3 / HTTPS.
  - Session tokens stored securely in Android KeyStore.
  - Users can request account deletion via the business owner.

### 5.2 Content Rating & Category
- **Category:** Business / Productivity
- **Content Rating:** Everyone (PEGI 3 / USK 0)
- **Target Audience:** Indian Business Owners, Retailers, MSMEs, Clinics, Institutes.

---

## 6. WhatsApp Integration Configuration

### Method A — Native WhatsApp Sharing
- **Configuration:** Zero backend setup required.
- **Workflow:** App generates branded PDF invoice in app-scoped cache and invokes Android Intent ShareSheet, opening WhatsApp with customer's number prefilled and PDF attached.

### Method B — Meta WhatsApp Business Cloud API
- **Configuration:** Set in backend `.env`:
  - `WHATSAPP_TOKEN=<Permanent Meta System User Token>`
  - `WHATSAPP_PHONE_NUMBER_ID=<15-digit Phone Number ID>`
  - `WHATSAPP_APP_SECRET=<Meta App Secret>`
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN=<Custom Webhook Secret>`
- **Webhook Endpoint:** `https://your-domain.com/api/whatsapp/webhook`
