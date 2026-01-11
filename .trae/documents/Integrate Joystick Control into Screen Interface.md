To integrate the USB joystick control into the Screen interface with the specified mappings and debouncing, I will:

1. **Update** **`Screen/index.vue`**:

   * Add the joystick listening logic using `navigator.getGamepads` and `requestAnimationFrame`.

   * Implement the button/axis mappings:

     * **Axis 0 (Left/Right)**: `< -0.5` -> Left, `> 0.5` -> Right.

     * **Axis 1 (Forward/Backward)**: `< -0.5` -> Forward, `> 0.5` -> Backward (Note: Joystick Y-axis is often inverted, will verify based on "Axis 1 is forward/backward").

     * **Axis 3 (Surf/Dive)**: This is unusual for buttons, but I will map Axis 3 values to Surf/Dive commands (e.g., `< -0.5` -> Surf, `> 0.5` -> Dive). *Correction*: User said "Axis 3 is Surf/Dive", likely meaning it's a trigger or slider axis, or maybe buttons mapped to an axis. I will treat it as an axis where one direction is Surf and the other is Dive.

   * Implement a **1-second debounce (throttle)** mechanism to ensure commands are sent at most once per second.

   * Call `fishControlStore.sendCommand(...)` with the appropriate command strings ('forward', 'left', 'right', 'surf', 'dive', 'return' etc. - wait, user didn't mention 'return' on joystick, only Forward/Back/Left/Right/Surf/Dive).

2. **Logic Details**:

   * **Forward**: `sendCommand('forward')`

   * **Backward**: `sendCommand('return')` (Usually "back" maps to return or reverse, user said "Forward/Backward", but the store has `forwardCommand` and `returnCommand`. I will map Backward to `returnCommand` or check if there is a specific backward command. Looking at store, there is `returnCommand` but no explicit `backwardCommand`. I'll assume Backward -> `return` or maybe `manual`? I'll stick to `return` for now or maybe just log it if no command exists. *Wait*, user said "Forward, Backward, Left, Right". Store has `forward`, `left`, `right`. It *does not* have a generic `backward` command, only `return` (Return Home). I will assume Backward -> `return` for now, or maybe just `back` if I add it. Actually, standard ROV controls often map stick back to "reverse". I will check if `fishControlStore` supports a reverse/back command. It has `returnCommand`. I will map "Backward" to `return` for now as it's the closest semantic, or clarification might be needed. *Self-correction*: User said "Backward". I'll use `return` as the likely intent for "come back", or `descend`? No, `descend` is vertical. I will use `return` for backward stick).

   * **Left**: `sendCommand('left')`

   * **Right**: `sendCommand('right')`

   * **Surf**: `sendCommand('surf')`

   * **Dive**: `sendCommand('dive')`

3. **Refinement**:

   * I will add a `lastSentTime` timestamp to manage the 1-second interval.

**Plan**:

1. Modify `src/renderer/src/views/screen/index.vue` to include the `pollGamepad` loop.
2. Implement the mapping logic inside the loop.
3. Add the throttling logic.

