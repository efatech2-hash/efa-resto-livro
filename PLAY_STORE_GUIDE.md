# EFA RESTO-LIVRO — Guide APK Android, AAB & Publication Google Play Store

## 1. Informations Google Play Console (Prêtes à copier-coller)

- **Nom de l’application** : `EFA RESTO-LIVRO`
- **Package Name (Application ID)** : `com.efa.restolivro`
- **Catégorie principale** : `Business` (ou `Productivité`)
- **Icône haute résolution (512 × 512 px)** : `public/pwa-512x512.png`
- **Icône adaptative Android (Maskable 512 × 512 px)** : `public/pwa-maskable-512x512.png`
- **Écran d’accueil (Splash Screen)** : Fond blanc `#FFFFFF` + logo officiel centré + texte `EFA RESTO-LIVRO`

### Description courte (79 caractères)
`Gérez restaurant, bar, caisse Mobile Money, stock, livraison et hôtel hors-ligne.`

### Description longue (Français)
`EFA RESTO-LIVRO est la solution tout-en-un conçue pour les restaurants, maquis, bars, services de livraison et hôtels en Afrique.

FONCTIONNALITÉS PRINCIPALES :
• Prise de commande rapide (Serveur) : interface tactile avec photos, tables, terrasse, à emporter et chambres.
• Caisse & Paiements : validation instantanée, génération de bons et tickets de caisse, encaissement Espèces, Flooz, Moov Money, Orange Money, Wave et Crédit Client fin de mois.
• Cuisine & Bar en direct : suivi de préparation étape par étape (En préparation → Prêt → Servi).
• Stock & Recettes automatiques : chaque commande validée déduit automatiquement les ingrédients selon la recette configurée, avec alertes de stock bas et gestion des approvisionnements.
• Livraison complète : calcul automatique des frais par quartier, attribution livreur et suivi EN COURS / LIVRÉ.
• Module Hôtel Premium : plan des chambres en temps réel (Libre, Occupée, En nettoyage, Réservée, Hors service), Check-in / Check-out, détection automatique des prolongations, facturation unifiée Chambre + Resto + Bar, réservations et suivi du ménage.
• Statistiques & Rentabilité : produits les plus vendus, marges, ventes par serveur et par mode de paiement, taux d’occupation hôtel.
• Mode Hors-Ligne : continuez à encaisser et prendre les commandes sans internet, synchronisation automatique au retour du réseau.`

### Captures d’écran recommandées pour Play Store
Prenez 4 à 6 captures en mode réel sur :
1. **Smartphone (1080 × 1920 px)** : Écran Serveur (photos + gros boutons) et Écran Caissier.
2. **Tablette 10 pouces (1920 × 1200 px)** : Menu à gauche + Plan des chambres Hôtel / Commandes à droite.
3. **Ordinateur (1440 × 900 px)** : Tableau de bord Statistiques & Super-Admin.

---

## 2. Les 10 étapes simples pour générer l’APK, l’AAB et publier sur Play Store

Le fichier `capacitor.config.ts` est déjà configuré avec le package `com.efa.restolivro`.

1. **Cloner le dépôt** sur votre PC (avec Node.js ≥ 20 et Android Studio installés) :
   ```bash
   git clone https://github.com/efatech2-hash/efa-resto-livro.git
   cd efa-resto-livro
   npm install
   ```
2. **Créer le fichier `.env`** à la racine avec vos clés Supabase (`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`) puis compiler l’application web :
   ```bash
   npm run build
   ```
3. **Installer Capacitor et ajouter la plateforme Android** :
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   ```
4. **Copier les icônes et le splash screen officiels** dans Android (`android/app/src/main/res/`) :
   - Utilisez `public/pwa-512x512.png` et `public/logo-efa-clean.png` (via `npx @capacitor/assets generate` ou Android Studio *Image Asset Studio*).
5. **Synchroniser le build web vers Android** :
   ```bash
   npx cap sync android
   ```
6. **Ouvrir le projet dans Android Studio** :
   ```bash
   npx cap open android
   ```
7. **Tester sur téléphone ou émulateur** dans Android Studio (*Run ▶*) et vérifier que le package name dans `android/app/build.gradle` est bien `com.efa.restolivro` (`minSdkVersion >= 23`, `targetSdkVersion >= 34`).
8. **Générer l’APK de test / installation directe** :
   - Dans Android Studio : **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
   - Récupérez le fichier `app-release.apk` (ou `app-debug.apk`) à partager directement sur Android.
9. **Générer le fichier AAB signé pour Google Play Store** :
   - Dans Android Studio : **Build → Generate Signed Bundle / APK → Android App Bundle (AAB)**.
   - Créez votre Keystore (`.jks`) et conservez le mot de passe en lieu sûr, puis générez `app-release.aab`.
10. **Publier sur Google Play Console** :
    - Créez l’application `EFA RESTO-LIVRO` sur [play.google.com/console](https://play.google.com/console).
    - Importez `app-release.aab`, ajoutez l’icône `512×512` (`public/pwa-512x512.png`), les captures téléphone/tablette, la description ci-dessus, la déclaration de confidentialité (Supabase HTTPS) et soumettez pour révision.

> **Alternative TWA (Trusted Web Activity) sans Capacitor** :
> Déployez votre app sur votre domaine HTTPS, puis exécutez `npx @bubblewrap/cli init --manifest https://VOTRE-DOMAINE/manifest.json` et `npx @bubblewrap/cli build` pour obtenir directement un APK et un AAB Play Store basés sur votre PWA.
