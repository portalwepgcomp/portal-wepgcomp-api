import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AwardedPresentersService } from './awarded-presenters.service';
import { RankingResponseDtoDto } from './dto/response-awarded-presenters.dto';
@Controller('awarded-presenters')
export class AwardedPresentersController {
  constructor(
    private readonly awardedPresentersService: AwardedPresentersService,
  ) {}

  @Get('top-panelists/:eventEditionId')
  @ApiOperation({
    summary: 'Get all submissions ranked by panelists',
    description:
      'Retrieve all submissions for a specific event edition, ranked by panelists (evaluators average score)',
  })
  @ApiParam({
    name: 'eventEditionId',
    description: 'The ID of the event edition',
    type: 'string',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of top submissions to retrieve (default: all)',
    required: false,
    type: 'number',
  })
  async getTopPanelistsRanking(
    @Param('eventEditionId') eventEditionId: string,
    @Query('limit') limit?: string,
  ): Promise<RankingResponseDtoDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.awardedPresentersService.findTopEvaluatorsRanking(
      eventEditionId,
      parsedLimit,
    );
  }

  @Get('top-audience/:eventEditionId')
  @ApiOperation({
    summary: 'Get all submissions ranked by audience',
    description:
      'Retrieve all submissions for a specific event edition, ranked by audience (public average score)',
  })
  @ApiParam({
    name: 'eventEditionId',
    description: 'The ID of the event edition',
    type: 'string',
  })
  @ApiQuery({
    name: 'limit',
    description: 'Number of top submissions to retrieve (default: all)',
    required: false,
    type: 'number',
  })
  async getTopAudienceRanking(
    @Param('eventEditionId') eventEditionId: string,
    @Query('limit') limit?: string,
  ): Promise<RankingResponseDtoDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.awardedPresentersService.findTopPublicRanking(
      eventEditionId,
      parsedLimit,
    );
  }
}
