// This file contains deprecated or unused code that has been removed from the main codebase.

// Global Dice Export Function (Removed from main.js)
/*
window.exportDiceIcon = async (options = {}) => {
    const {
        size = 512,
        count = 1,
        color = 0x9b59b6,
        sides = 6
    } = options;

    console.log('Exporting dice icon with options:', { size, count, color, sides });

    if (!window.gameApp) {
        console.error('Game app not found. Game might not be fully initialized.');
        return;
    }

    try {
        const container = TileRenderer.createTile({
            size,
            diceCount: count,
            diceSides: sides,
            color,
            fillAlpha: 1.0,
            showBorder: true
        });

        const image = await window.gameApp.renderer.extract.image(container);
        const dataUrl = image.src;

        const link = document.createElement('a');
        link.download = `dice_icon_s${sides}_c${count}_${size}px.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('Dice icon exported successfully!');
        container.destroy({ children: true });
    } catch (err) {
        console.error('Failed to export dice icon:', err);
    }
};
*/
