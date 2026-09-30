# TrackUrInvests

Tableau de bord local pour suivre un compte bourse Fortuneo (compte titres ou PEA) à partir des exports de l'espace client.

Vos fichiers sont lus uniquement dans votre navigateur : rien n'est envoyé sur un serveur. Seuls les codes des titres (ISIN ou symboles) partent vers Yahoo Finance pour récupérer les cours.

## Ce que ça affiche

- **Indicateurs** : valeur actuelle, gain total, rendement annualisé (TRI), plus-values latentes et réalisées, dividendes perçus, frais et taxes.
- **Comparaison au marché** : la courbe de votre portefeuille face à un portefeuille fictif qui aurait investi exactement les mêmes montants, aux mêmes dates, dans un indice (MSCI World, MSCI ACWI, CAC 40, S&P 500…). L'écart en euros et les deux rendements annualisés sont affichés.
- **Plus-values latentes par ligne**, **répartition** du portefeuille, **dividendes et frais par année**.
- **Tableau des lignes** avec quantité, PRU (frais inclus), cours, valorisation et plus-values.

## Installation

Prérequis : [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
npm install
npm start
```

L'application s'ouvre sur http://localhost:5173. Il faut passer par `npm start` : c'est le serveur local qui relaie les requêtes vers Yahoo Finance, ce qu'une page ouverte directement depuis le disque ne peut pas faire.

Le bouton « Essayer avec des données d'exemple » permet de découvrir l'outil sans ses propres fichiers.

## Récupérer ses exports Fortuneo

1. Dans l'espace client, onglet Bourse, exportez l'**historique des opérations** (Excel ou CSV). Exportez aussi l'**état du portefeuille** si possible : il aide à identifier les titres (codes ISIN) et donne les derniers cours si Yahoo Finance est injoignable.
2. Rangez tous les exports dans un même dossier. Vous pouvez y ajouter de nouveaux exports au fil du temps : les opérations présentes dans plusieurs fichiers ne sont comptées qu'une fois.
3. Dans l'application, cliquez sur « Choisir le dossier d'exports ».

Sur Chrome et Edge, le dossier est mémorisé : aux visites suivantes, un clic sur « Rouvrir » suffit. Sur Firefox et Safari, il faut le resélectionner à chaque fois.

### Connexion directe à Fortuneo ?

Fortuneo ne propose pas d'API publique. Se connecter automatiquement obligerait à stocker vos identifiants et à contourner la double authentification, ce qui serait fragile et risqué. L'outil s'appuie donc sur les exports.

## Formats reconnus

Les fichiers `.xls`, `.xlsx`, `.csv` et `.txt` sont lus. Les colonnes sont reconnues par leur nom (accents et majuscules ignorés), par exemple :

| Donnée | Noms de colonnes acceptés |
|---|---|
| Titre | Libellé, Valeur, Titre, Nom |
| Opération | Opération, Nature, Type, Sens |
| Date | Date, Date d'opération, Date d'exécution |
| Quantité | Qté, Quantité, Nombre |
| Prix | Prix d'exé, Prix d'exécution, Cours d'exécution |
| Montants | Montant brut, Courtage, Montant net |
| Portefeuille | Code ISIN, PRU, Cours, Valorisation |

Les opérations sont classées d'après leur libellé : achat, vente, dividende ou coupon, frais (droits de garde…), taxe (TTF…), virement. Le panneau « Fichiers lus et opérations », en bas de page, indique comment chaque fichier a été interprété et liste les libellés non reconnus.

Si un export n'est pas reconnu, ouvrez une issue avec la ligne d'en-tête du fichier (sans vos données).

## Cours de bourse

Pour chaque titre, le symbole Yahoo Finance est retrouvé à partir de l'ISIN, sinon du libellé. Si le symbole trouvé est faux ou manquant, corrigez-le directement dans la colonne « Symbole » du tableau des lignes : le choix est mémorisé. Les titres cotés dans une autre devise sont convertis en euros au taux du jour.

Les cours sont gardés en cache une journée dans le navigateur. Le bouton « Rouvrir » relit le dossier et rafraîchit les cours.

## Méthodes de calcul

- **PRU** : prix moyen pondéré, frais d'achat inclus. Une vente sort les titres au PRU : la différence avec le montant net encaissé est la plus-value réalisée.
- **Gain total** : valeur actuelle + ventes + dividendes, moins achats, frais et taxes.
- **Rendement annualisé** : taux de rendement interne (XIRR) des flux réels. Il tient compte du moment où chaque euro a été investi.
- **Comparaison à l'indice** : chaque achat achète des parts de l'indice pour le même montant, chaque vente en revend pour le même montant. L'indice utilise les cours ajustés des dividendes.

## Développement

```bash
npm test          # tests unitaires (Vitest)
npm run build     # version de production dans dist/
npm run preview   # sert la version de production, proxy compris
```

Organisation du code :

- `src/lib/parse.js` : lecture des fichiers et reconnaissance des colonnes
- `src/lib/operations.js` : classification et dédoublonnage des opérations
- `src/lib/portfolio.js` : positions, PRU, plus-values, dividendes et frais
- `src/lib/performance.js` : historique quotidien, indice de comparaison, XIRR
- `src/lib/market.js` : cours Yahoo Finance, cache et conversion de devises
- `src/lib/folder.js` : accès au dossier d'exports
- `src/main.js`, `src/ui/` : interface et graphiques (Chart.js)
