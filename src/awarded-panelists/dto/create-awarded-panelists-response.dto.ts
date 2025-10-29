export class CreateAwardedPanelistsResponseDto {
  addedPanelists: string[];
  maintainedPanelists: string[];

  constructor(params: {
    addedPanelists: string[];
    maintainedPanelists: string[];
  }) {
    this.addedPanelists = params.addedPanelists;
    this.maintainedPanelists = params.maintainedPanelists;
  }
}
