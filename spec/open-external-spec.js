describe("open-external", () => {
  it("activates and deactivates cleanly", async () => {
    await atom.packages.activatePackage("open-external");
    expect(atom.packages.isPackageActive("open-external")).toBe(true);
    await atom.packages.deactivatePackage("open-external");
    expect(atom.packages.isPackageActive("open-external")).toBe(false);
  });
});
