# MedPilot Clinical — Architecture SaaS

## Conclusion d’architecture

MedPilot Clinical est conçu comme un **copilote de décision clinique supervisé**. Il structure un dossier patient, analyse les symptômes, détecte les signaux d’alerte, propose des hypothèses différentielles, suggère des examens à considérer et prépare une synthèse explicable. Il ne rend pas de diagnostic définitif, ne prescrit pas de traitement et ne remplace pas un professionnel de santé.

Cette limite n’est pas un détail d’interface. Elle est inscrite dans la logique métier, dans le schéma de données, dans les prompts des agents, dans les permissions serveur et dans le journal d’audit.

> Toute recommandation générée par MedPilot doit être revue, corrigée et validée par un professionnel habilité avant d’être utilisée dans une décision de soins.

## Parcours fonctionnel

Le parcours nominal commence par un cas clinique dé-identifié. Le professionnel saisit le motif principal et les symptômes disponibles. MedPilot exécute ensuite une chaîne d’agents spécialisés. Chaque agent reçoit un périmètre limité, produit une sortie structurée et expose les données manquantes ou les incertitudes détectées. Un agent de politique bloque les sorties qui tenteraient de prescrire automatiquement ou de transformer une hypothèse en diagnostic certain. La synthèse finale est affichée comme un brouillon de revue clinique.

| Étape | Agent | Entrée principale | Sortie attendue | Règle de sécurité |
|---|---|---|---|---|
| 1 | Intake & sécurité | Identité dé-identifiée, âge, sexe, motif | Contexte normalisé, urgences potentielles | Bloquer si données critiques absentes |
| 2 | Analyse des symptômes | Symptômes, chronologie, intensité | Variables cliniques structurées | Séparer faits rapportés et inférences |
| 3 | Hypothèses différentielles | Variables structurées | Pistes à discuter, avec incertitude | Interdire le diagnostic définitif |
| 4 | Examens à considérer | Pistes, signaux d’alerte, protocole | Examens possibles et justification | Ne jamais déclencher une ordonnance ou un examen automatiquement |
| 5 | Sécurité médicamenteuse | Médicaments, allergies, âge, contexte | Points de vérification et contre-indications possibles | Interdire toute posologie générée sans validation |
| 6 | Synthèse supervisée | Sorties des agents précédents | Brouillon de synthèse | Revue humaine obligatoire et auditée |

## Architecture technique

Le projet utilise une application fullstack React, TypeScript, Express, tRPC, Drizzle ORM, MySQL/TiDB, stockage objet et authentification Manus OAuth. Le client consomme exclusivement les contrats tRPC. Le serveur conserve les secrets et exécute les appels au modèle de langage. La base stocke les cas, les exécutions d’agents, les recommandations et les événements d’audit.

```text
Navigateur professionnel
        |
        v
React + Tailwind + tRPC client
        |
        v
Express + tRPC + protectedProcedure
        |
        +--> Contrôle d’accès et rôle
        +--> Validation Zod des entrées
        +--> Orchestrateur clinique
        |       +--> Intake / Safety
        |       +--> Symptom analysis
        |       +--> Differential hypotheses
        |       +--> Exam considerations
        |       +--> Medication safety
        |       +--> Supervised synthesis
        |
        +--> LLM server-side avec sortie JSON Schema
        +--> Drizzle ORM -> MySQL/TiDB
        +--> Journal d’audit immuable
```

## Modèle de données

La table `clinicalCases` représente un cas de travail dé-identifié. Elle contient une référence technique, des initiales, l’âge, le sexe, le motif principal, les symptômes, le statut du dossier et son niveau d’acuité. Les données directement identifiantes ne doivent pas être ajoutées à cette table sans une conception spécifique de protection des données.

La table `agentRuns` conserve une trace par agent. Elle stocke son état, son niveau de confiance, la sortie structurée et les horodatages. Cette granularité permet de comprendre quelle étape a produit une information, de rejouer une étape non destructive et de comparer les performances par agent.

La table `clinicalRecommendations` conserve les éléments proposés pour la revue humaine. Chaque recommandation possède un type, une priorité et un indicateur `requiresReview`. Le type `medication_safety` est volontairement orienté vers les vérifications de sécurité et non vers la prescription.

La table `auditEvents` reçoit les événements de création de cas, de démarrage d’analyse, de fin d’analyse, de blocage et de revue. Elle doit être traitée comme append-only en production. Les accès d’administration doivent eux-mêmes être journalisés.

## Contrats serveur livrés

Les procédures tRPC suivantes sont implémentées dans `server/routers.ts` :

| Procédure | Accès | Rôle |
|---|---|---|
| `clinical.list` | Authentifié | Lister les cas récents |
| `clinical.get` | Authentifié | Charger un cas, ses agents et ses recommandations |
| `clinical.create` | Authentifié | Créer un cas avec validation Zod |
| `clinical.analyze` | Authentifié | Exécuter l’analyse structurée, persister les sorties et journaliser l’événement |

L’analyse appelle le LLM uniquement côté serveur. Elle utilise un JSON Schema strict. Le prompt système interdit explicitement le diagnostic définitif, la prescription et le remplacement des urgences ou du clinicien. Les sorties sont persistées avec `requiresReview = 1` au niveau des recommandations.

## Contrôle d’accès et sécurité applicative

L’accès aux dossiers cliniques est protégé par `protectedProcedure`. Les entrées sont validées avec Zod avant toute écriture. Le navigateur ne reçoit aucun secret LLM. Les routes de lecture et d’analyse ne sont pas publiques. Le rôle `admin` du modèle d’identité est prévu pour les opérations de gouvernance, les protocoles et les paramétrages, mais doit être complété par une matrice de permissions métier avant la mise en production.

Le produit doit être déployé avec chiffrement en transit et au repos, séparation des environnements, rotation des secrets, sauvegardes chiffrées et contrôle d’accès par organisation. Les données d’exemple visibles dans l’interface sont fictives et dé-identifiées.

## Ce qui est déjà livré

Le cockpit comprend une vue d’ensemble avec métriques, cas à revoir, activité des agents, qualité et conformité. La vue Cas cliniques présente un dossier démonstrateur et l’orchestration animée de six agents. La vue Agents IA expose les responsabilités séparées. La vue Journal & conformité expose un journal de gouvernance. Le responsive mobile est couvert par un menu latéral adapté.

Le projet contient également une migration Drizzle appliquée à la base, des procédures tRPC sécurisées, l’appel LLM structuré côté serveur et des tests Vitest de contrôle d’accès et de blocage sur cas inexistant.

## Stratégie de validation avant production

| Domaine | État du prototype | Étape de production |
|---|---|---|
| Identité | Manus OAuth et rôle de base | Ajouter organisations, RBAC clinique et SSO si nécessaire |
| Données | Cas dé-identifiés et audit | DPIA, politique de rétention, chiffrement et gestion du consentement |
| IA | Sortie JSON structurée et agents spécialisés | Validation clinique, jeu de tests annoté, évaluation de biais et monitoring |
| Médicaments | Vérifications de sécurité uniquement | Connecter un référentiel réglementaire validé, sans dosage autonome |
| Urgences | Signaux d’alerte visibles | Protocole explicite d’escalade vers les services d’urgence |
| Qualité | Journal et tests de garde-fous | Revue indépendante, tests de pénétration et traçabilité complète |
| Exploitation | Serveur web et base managée | Observabilité, alertes, sauvegardes, reprise après incident et runbooks |

## Décisions d’ingénierie importantes

Le système utilise plusieurs agents au lieu d’un unique prompt monolithique afin de rendre les responsabilités et les erreurs localisables. Les agents retournent des objets structurés plutôt qu’un texte libre afin de faciliter la validation, l’affichage, l’audit et les tests. La synthèse n’a pas le droit d’effacer l’incertitude des agents amont. Une sortie avec information critique manquante doit être affichée comme incomplète et non comme une réponse partielle présentée comme certaine.

Le prototype inclut une simulation d’orchestration dans le cockpit afin de permettre une démonstration sans compte ni données patient réelles. Le parcours de production doit connecter l’interface au contrat `clinical.analyze` après authentification et ajouter les vérifications organisationnelles nécessaires.

## Prochaines itérations recommandées

La prochaine itération doit ajouter un véritable formulaire de création de cas avec contrôles de cohérence, import de documents au travers d’un stockage sécurisé et mécanisme de consentement. Elle doit ensuite intégrer des référentiels cliniques versionnés et un moteur de règles déterministes pour les signaux d’alerte à haute criticité. Les recommandations de médicaments doivent rester limitées à la sécurité, aux interactions et aux questions à vérifier tant qu’un référentiel réglementaire et une validation clinique formelle ne sont pas en place.

La mise en production doit enfin être précédée d’une validation clinique et réglementaire propre au pays d’utilisation. Le statut légal du logiciel dépend de son usage, de ses fonctionnalités et des décisions prises à partir de ses sorties.

## Références

[1]: https://www.who.int/publications/i/item/9789240029200 "WHO guidance on ethics and governance of artificial intelligence for health"

[2]: https://eur-lex.europa.eu/eli/reg/2016/679/oj "Règlement général sur la protection des données — RGPD"

[3]: https://eur-lex.europa.eu/eli/reg/2024/1689/oj "Règlement européen sur l’intelligence artificielle — AI Act"

## Extensions produit livrées

La route publique `/` est maintenant une landing page de présentation. Elle expose la proposition de valeur, l’architecture multi-agents, les garanties de sécurité et trois offres mensuelles. Le cockpit clinique reste accessible sur `/app`. Les CTA de pricing demandent l’authentification puis ouvrent Stripe Checkout dans un nouvel onglet. Le pied de page propose également l’ouverture du portail client Stripe pour gérer l’abonnement.

L’export PDF est réalisé côté navigateur à partir de la synthèse visible. Le document contient la référence du dossier, les informations patient dé-identifiées, les notes structurées, le triage à confirmer, les signaux d’alerte, les hypothèses, les examens à considérer et les points de sécurité médicamenteuse. Le document rappelle qu’il s’agit d’un brouillon soumis à validation humaine.

L’orchestration du cockpit affiche maintenant une progression calculée à chaque étape d’agent. La barre de progression et l’état de chaque agent sont mis à jour en temps réel pendant la simulation multi-agents. En production, cette présentation peut être alimentée par des événements de progression persistés ou par un flux SSE si les contraintes d’hébergement le permettent.

Le tableau des cas supporte la recherche textuelle, le filtre par gravité, le filtre temporel et le tri par date ou gravité décroissante. Les contrôles restent côté interface pour le prototype. Lorsque le volume réel dépassera la capacité de démonstration, les mêmes paramètres devront être déplacés vers une procédure tRPC paginée et indexée côté base de données.

## Paiements récurrents

Stripe est intégré côté serveur avec trois offres centralisées dans `server/products.ts`. `billing.createCheckout` crée une session d’abonnement récurrent. `billing.createPortal` crée une session du portail client. Le webhook `/api/stripe/webhook` reçoit le corps brut avant `express.json()`, vérifie la signature et conserve uniquement les identifiants Stripe essentiels sur la table `users`.

Les clés Stripe sont lues depuis les variables d’environnement gérées par la plateforme. Les identifiants de prix `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_CLINIC` et `STRIPE_PRICE_ENTERPRISE` sont pris en charge lorsqu’ils sont disponibles. En leur absence, le checkout utilise une définition de prix récurrente inline afin que le parcours de démonstration reste autonome. Pour la production, il est préférable de créer les prix dans Stripe Dashboard et de renseigner leurs identifiants afin d’éviter la création répétée de prix.

Le webhook traite la fin d’un checkout et les changements de cycle de vie d’un abonnement. Il met à jour uniquement `stripeCustomerId` et `stripeSubscriptionId`. Il ne stocke jamais de numéro de carte, de CVV, de date d’expiration, de payload brut ou de secret.

## Revue interactive et signature

Le cockpit inclut un composant `AIChatBox` contextualisé au cas clinique. La procédure `clinical.ask` est protégée par authentification, limite l’historique et la longueur des questions, transmet au LLM les éléments cliniques nécessaires ainsi que les sorties précédentes, et journalise le début et la fin de chaque échange. Le prompt interdit les diagnostics définitifs et les prescriptions autonomes ; chaque réponse rappelle la nécessité d’une validation médicale.

Le tableau de bord présente un histogramme de tendance sur les trente derniers jours avec le volume quotidien, un total, et la répartition par niveaux critique, élevée, modérée et faible. Le prototype utilise une série de démonstration ; la version de production devra l’alimenter par une agrégation SQL indexée sur `createdAt` et `acuity`.

La revue PDF accepte désormais des notes personnelles du médecin et une signature numérique textuelle de revue. Ces éléments sont inclus dans le document final, avec un rappel explicite que la signature atteste une revue humaine et non une délégation de la décision à l’IA.

La navigation de la landing page est sticky et observe les sections `Produit`, `Agents IA`, `Sécurité` et `Tarifs` via `IntersectionObserver`. L’élément correspondant à la section visible reçoit un marqueur actif sous le libellé afin de maintenir le contexte pendant le scroll.

## Signature manuscrite et conversations persistantes

Le workspace de cas fournit un canvas tactile et souris pour tracer une signature de revue. Le tracé est converti en image PNG côté navigateur et incorporé au PDF final via `jsPDF`. Le document précise qu’il s’agit d’une signature de revue humaine et non d’une signature électronique juridiquement certifiée tant qu’un prestataire de confiance n’est pas branché.

Les tables `clinicalConversations` et `clinicalChatMessages` conservent les fils de conversation avec leur dossier et leur propriétaire. Les procédures tRPC `clinical.conversations`, `clinical.conversation` et `clinical.ask` contrôlent l’authentification et le propriétaire, rechargent les derniers messages dans le contexte LLM, créent automatiquement un fil à la première question et journalisent les événements de question. Le dashboard privilégie les cas persistés lorsqu’ils existent, tout en conservant des données fictives dé-identifiées pour la démonstration.

Le graphique de gravité accepte les plages de 7, 30 ou 90 jours. Les infobulles affichent le nombre de cas et le jour associé au survol. La série de démonstration reste locale à l’interface ; une agrégation SQL sur les cas réels doit la remplacer en production.

## Correction Checkout Stripe

Le Checkout d’abonnement déclare maintenant explicitement `payment_method_types: ["card"]`. Cette configuration évite l’erreur Stripe indiquant qu’aucun type de paiement valide n’est disponible lorsque les moyens de paiement automatiques ne sont pas activés pour la devise choisie. Les trois offres restent des abonnements mensuels en EUR et le serveur continue de gérer les identifiants de prix configurés ou les prix récurrents inline de démonstration.

## Parcours compte et hôpital numérique

MedPilot dispose désormais d’un espace `/account` protégé par la session Manus OAuth. Après connexion, l’utilisateur peut compléter son profil et choisir un rôle opérationnel parmi **patient**, **médecin**, **clinique** et **client / réseau**. Le compte administrateur est protégé contre une rétrogradation accidentelle. Les données de facturation restent référencées par les identifiants Stripe existants et le portail client.

Les tables `userProfiles`, `organizations`, `organizationMembers` et `consultations` forment le socle du répertoire : profils professionnels, cliniques ou réseaux, membres avec permissions et timeline de consultations. Les procédures `account.me`, `account.setup`, `account.createOrganization`, `account.addMember`, `account.createConsultation` et `account.directory` appliquent l’authentification et les contrôles de propriétaire. Un patient peut créer une demande pour son propre compte ; un professionnel ou une clinique peut organiser une consultation pour un patient autorisé. Les dossiers cliniques ne sont pas listés aux patients et la création de dossier est réservée aux profils habilités.

La route `/billing/success` confirme visuellement le paiement Stripe, affiche l’offre sélectionnée et redirige vers `/app`. Le chat contextuel propose maintenant **Insérer dans les notes**, avec un libellé explicite indiquant que la réponse doit être vérifiée. Le canvas de signature propose **Annuler** pour restaurer le dernier tracé et **Effacer tout** avant l’export PDF.

Ce socle constitue une base de grand hôpital numérique, mais la mise en production réglementée doit encore ajouter la gestion fine des consentements, la vérification d’identité professionnelle, les règles de conservation, le chiffrement applicatif, les connecteurs DPI/HDS, la disponibilité des rendez-vous et les politiques d’accès par organisation.
