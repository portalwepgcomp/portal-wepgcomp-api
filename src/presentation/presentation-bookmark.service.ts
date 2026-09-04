import { Injectable } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookmarkedPresentationResponseDto,
  BookmarkedPresentationsResponseDto,
  BookmarkPresentationRequestDto,
  BookmarkPresentationResponseDto,
} from './dto/bookmark-presentation.dto';

@Injectable()
export class PresentationBookmarkService {
  constructor(private readonly prismaClient: PrismaService) {}

  async bookmarkPresentation(
    bookmarkPresentationRequestDto: BookmarkPresentationRequestDto,
    userId: string,
  ): Promise<BookmarkPresentationResponseDto> {
    const { presentationId } = bookmarkPresentationRequestDto;

    const user = await this.prismaClient.userAccount.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new AppException('Usuário não encontrado.', 404);
    }

    const presentation = await this.prismaClient.presentation.findUnique({
      where: {
        id: presentationId,
      },
    });

    if (!presentation) {
      throw new AppException('Apresentação não encontrada.', 404);
    }

    const updatedUser = await this.prismaClient.userAccount.update({
      where: {
        id: userId,
      },
      data: {
        bookmarkedPresentations: {
          connect: {
            id: presentation.id,
          },
        },
      },
      include: {
        bookmarkedPresentations: {
          include: {
            submission: {
              include: {
                mainAuthor: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
                advisor: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return new BookmarkPresentationResponseDto(
      updatedUser.bookmarkedPresentations,
    );
  }

  async bookmarkedPresentation(
    userId: string,
    presentationId: string,
  ): Promise<BookmarkedPresentationResponseDto> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: {
        id: userId,
      },
      include: {
        bookmarkedPresentations: {
          where: {
            id: presentationId,
          },
        },
      },
    });

    const bookmarked = !!(user && user.bookmarkedPresentations.length > 0);

    return new BookmarkedPresentationResponseDto(bookmarked);
  }

  async bookmarkedPresentations(
    userId: string,
  ): Promise<BookmarkedPresentationsResponseDto> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: {
        id: userId,
      },
      include: {
        bookmarkedPresentations: {
          include: {
            submission: {
              include: {
                mainAuthor: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
                advisor: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppException('Usuário não encontrado.', 404);
    }

    return new BookmarkedPresentationsResponseDto(user.bookmarkedPresentations);
  }

  async removePresentationBookmark(
    presentationId: string,
    userId: string,
  ): Promise<BookmarkedPresentationsResponseDto> {
    const user = await this.prismaClient.userAccount.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new AppException('Usuário não encontrado.', 404);
    }

    const presentation = await this.prismaClient.presentation.findUnique({
      where: {
        id: presentationId,
      },
    });

    if (!presentation) {
      throw new AppException('Apresentação não encontrada.', 404);
    }

    const updatedUser = await this.prismaClient.userAccount.update({
      where: {
        id: userId,
      },
      data: {
        bookmarkedPresentations: {
          disconnect: {
            id: presentation.id,
          },
        },
      },
      include: {
        bookmarkedPresentations: {
          include: {
            submission: {
              include: {
                mainAuthor: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
                advisor: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return new BookmarkedPresentationsResponseDto(
      updatedUser.bookmarkedPresentations,
    );
  }
}
