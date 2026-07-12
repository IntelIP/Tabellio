import { ForgeProvider } from "./forge-provider.mjs";

export class RemoteRepositoryProvider extends ForgeProvider {
  constructor({ providerId }) {
    super();
    if (typeof providerId !== "string" || !/^[a-z][a-z0-9-]*$/.test(providerId)) {
      throw new TypeError("providerId must be a lowercase provider identifier.");
    }
    this.providerId = providerId;
  }

  async createRepository(_options) {
    throw new Error("RemoteRepositoryProvider.createRepository must be implemented.");
  }

  async archiveRepository(_options) {
    throw new Error("RemoteRepositoryProvider.archiveRepository must be implemented.");
  }

  async gitRemote(options) {
    const repository = await this.repository(options);
    return {
      provider: this.providerId,
      repositoryId: repository.id,
      cloneUrl: repository.cloneUrl,
      defaultBranch: repository.defaultBranch,
    };
  }
}
