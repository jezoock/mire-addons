# Clés publiques de signature

Ce dossier reçoit la clé publique qui vérifie l'index du dépôt (`<nom>.pub.pem`, format SPKI PEM). Elle sera
versionnée ici une fois fournie par le propriétaire du dépôt, puis intégrée à Mire (tâche P3-07).

Quand ce dossier contient au moins une clé `.pub.pem`, la publication refuse de signer avec une clé privée qui ne
correspond à aucune d'elles. Aucune clé privée n'a sa place ici (le `.gitignore` les écarte).
