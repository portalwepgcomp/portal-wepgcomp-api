import { SetMetadata } from '@nestjs/common';
import { Profile } from '@prisma/client';

export const RequiredProfiles = (...profiles: Profile[]) =>
  SetMetadata('profiles', profiles);
