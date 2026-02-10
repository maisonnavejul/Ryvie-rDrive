class Environment {
  isProduction() {
    return import.meta.env.MODE === "production";
  }
}

export default new Environment();
