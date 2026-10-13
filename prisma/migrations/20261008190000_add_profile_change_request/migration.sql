/*
  Solicitação de troca de perfil pelo próprio usuário, aprovada por um admin.
  Há no máximo uma solicitação pendente por usuário: `requested_profile`
  preenchido = pendente. Aprovar ou recusar limpa os três campos.
*/

ALTER TABLE "user_account"
  ADD COLUMN "requested_profile" "profile",
  ADD COLUMN "requested_subprofile" "sub_profile",
  ADD COLUMN "profile_requested_at" TIMESTAMP(3);
