import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import {
  CreateUserDto,
  Profile,
  SetAdminDto,
  UserLevel,
} from './dto/create-user.dto';
import { ResponseUserDto } from './dto/response-user.dto';
import { PrismaService } from '../prisma/prisma.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: UserService,
          useValue: {
            create: jest.fn(),
            remove: jest.fn(),
            toggleUserActivation: jest.fn(),
            approveTeacher: jest.fn(),
            promoteToSuperadmin: jest.fn(),
            findAll: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user and return the result', async () => {
      const createUserDto: CreateUserDto = {
        name: 'John Doe',
        email: 'johndoe@example.com',
        password: 'Password@1234',
        registrationNumber: '2021001',
        photoFilePath: 'user-photo-url',
        profile: Profile.Presenter,
        level: UserLevel.Default,
        isActive: true,
      };

      const userResponse = {
        id: '1',
        name: 'John Doe',
        email: 'johndoe@example.com',
        registrationNumber: '2021001',
        registrationNumberType: 'MATRICULA' as any,
        photoFilePath: 'user-photo-url',
        profile: Profile.Presenter,
        level: UserLevel.Default,
        isActive: true,
        isTeacherActive: false,
        isPresenterActive: false,
        hasSubmission: false,
        isSuperadmin: false,
        isAdmin: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        isVerified: false,
      };

      jest.spyOn(userService, 'create').mockResolvedValue(userResponse);

      const result = await controller.create(createUserDto);

      expect(userService.create).toHaveBeenCalledWith(createUserDto);
      expect(result).toEqual(userResponse);
    });
  });

  describe('remove', () => {
    it('should remove a user by ID', async () => {
      const userId = '1234';

      const removeResponse = {
        success: true,
        message: 'Cadastro de Usuário removido com sucesso.',
      };

      jest.spyOn(userService, 'remove').mockResolvedValue(removeResponse);
      const result = await controller.remove(userId);

      expect(userService.remove).toHaveBeenCalledWith(userId);
      expect(result).toEqual(removeResponse);
    });
  });

  describe('getUsers', () => {
    it('should return all users when no filters are applied', async () => {
      const usersMock = [
        {
          id: '1',
          name: 'John',
          email: 'john@example.com',
          password: 'hashedPassword123',
          registrationNumber: '2023001',
          registrationNumberType: 'MATRICULA' as any,
          photoFilePath: 'path/to/photo1.jpg',
          level: UserLevel.Admin,
          profile: Profile.Professor,
          isActive: true,
          isTeacherActive: false,
          isSuperadmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          isVerified: false,
        },
        {
          id: '2',
          name: 'Jane',
          email: 'jane@example.com',
          password: 'hashedPassword456',
          registrationNumber: '2023002',
          registrationNumberType: 'CPF' as any,
          photoFilePath: 'path/to/photo2.jpg',
          level: UserLevel.Default,
          profile: Profile.Listener,
          isActive: false,
          isTeacherActive: false,
          isSuperadmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          isVerified: false,
        },
      ];

      jest
        .spyOn(userService, 'findAll')
        .mockResolvedValue(
          usersMock.map((user) => new ResponseUserDto(user as any)),
        );

      const result = await controller.getUsers();

      expect(userService.findAll).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(
        usersMock.map((user) => new ResponseUserDto(user as any)),
      );
    });

    it('should return users filtered by role', async () => {
      const usersMock = [
        {
          id: '1',
          name: 'John',
          email: 'john@example.com',
          password: 'hashedPassword123',
          registrationNumber: '2023001',
          photoFilePath: 'path/to/photo1.jpg',
          level: UserLevel.Admin,
          profile: Profile.Professor,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          isVerified: false,
        },
      ];

      jest
        .spyOn(userService, 'findAll')
        .mockResolvedValue(
          usersMock.map((user) => new ResponseUserDto(user as any)),
        );

      const result = await controller.getUsers('Admin');

      expect(userService.findAll).toHaveBeenCalledWith(
        ['Admin'],
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(
        usersMock.map((user) => new ResponseUserDto(user as any)),
      );
    });

    it('should return users filtered by profile', async () => {
      const usersMock = [
        {
          id: '2',
          name: 'Jane',
          email: 'jane@example.com',
          password: 'hashedPassword456',
          registrationNumber: '2023002',
          photoFilePath: 'path/to/photo2.jpg',
          level: UserLevel.Default,
          profile: Profile.Listener,
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          isVerified: false,
        },
      ];

      jest
        .spyOn(userService, 'findAll')
        .mockResolvedValue(
          usersMock.map((user) => new ResponseUserDto(user as any)),
        );

      const result = await controller.getUsers(undefined, 'Listener');

      expect(userService.findAll).toHaveBeenCalledWith(
        undefined,
        ['Listener'],
        undefined,
        undefined,
      );
      expect(result).toEqual(
        usersMock.map((user) => new ResponseUserDto(user as any)),
      );
    });

    it('should return users filtered by both role and profile', async () => {
      const usersMock = [
        {
          id: '1',
          name: 'John',
          email: 'john@example.com',
          password: 'hashedPassword123',
          registrationNumber: '2023001',
          photoFilePath: 'path/to/photo1.jpg',
          level: UserLevel.Admin,
          profile: Profile.Professor,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          isVerified: false,
        },
      ];

      jest
        .spyOn(userService, 'findAll')
        .mockResolvedValue(
          usersMock.map((user) => new ResponseUserDto(user as any)),
        );

      const result = await controller.getUsers('Admin', 'Professor');

      expect(userService.findAll).toHaveBeenCalledWith(
        ['Admin'],
        ['Professor'],
        undefined,
        undefined,
      );
      expect(result).toEqual(
        usersMock.map((user) => new ResponseUserDto(user as any)),
      );
    });
  });
});
