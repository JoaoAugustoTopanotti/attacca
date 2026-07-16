-- M3 (conflito de mesma célula): cada contribuição grava seu "merge base" — o
-- que estava aceito na célula quando ela foi escrita. Conflito = base ≠ aceito
-- atual E conteúdo (normalizado) difere; o dono resolve compasso a compasso.
ALTER TABLE "CellContribution" ADD COLUMN "baseContributionId" TEXT;
