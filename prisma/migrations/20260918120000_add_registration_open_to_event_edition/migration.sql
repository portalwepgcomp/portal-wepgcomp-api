/*
  Move o controle de abertura do cadastro público da env `REGISTRATION_OPEN`
  para o banco, por edição. A leitura pública e a escrita consideram apenas a
  edição ativa (`is_active`).

  Notas:

  - O padrão é `false`: após a migration o cadastro fica fechado até um admin
    abrir explicitamente, que é o mesmo padrão que a env tinha.
  - Trocar a edição ativa não altera esta flag em nenhuma das edições.
*/

ALTER TABLE "event_edition"
  ADD COLUMN "registration_open" BOOLEAN NOT NULL DEFAULT false;
