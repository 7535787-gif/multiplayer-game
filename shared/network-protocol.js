const MAGIC_0 = 0x4d; // M
const MAGIC_1 = 0x47; // G
export const BINARY_PROTOCOL_VERSION = 1;
const TYPE_INPUT = 1;
const TYPE_SNAPSHOT = 2;
const INPUT_PACKET_SIZE = 9;
const SNAPSHOT_HEADER_SIZE = 13;
const PLAYER_FIXED_SIZE = 24;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function assertPacketHeader(view, expectedType) {
    if (view.byteLength < 4 || view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1) {
        throw new TypeError('Invalid binary packet signature');
    }
    if (view.getUint8(2) !== BINARY_PROTOCOL_VERSION) {
        throw new TypeError('Unsupported binary protocol version');
    }
    if (view.getUint8(3) !== expectedType) {
        throw new TypeError('Unexpected binary packet type');
    }
}
export function encodeInput(input) {
    if (!Number.isSafeInteger(input?.seq) || input.seq < 0 || input.seq > 0xffffffff) {
        throw new RangeError('input.seq must be an unsigned 32-bit integer');
    }
    for (const key of ['left', 'right', 'thrust', 'brake']) {
        if (typeof input[key] !== 'boolean')
            throw new TypeError(`input.${key} must be boolean`);
    }
    const buffer = new ArrayBuffer(INPUT_PACKET_SIZE);
    const view = new DataView(buffer);
    view.setUint8(0, MAGIC_0);
    view.setUint8(1, MAGIC_1);
    view.setUint8(2, BINARY_PROTOCOL_VERSION);
    view.setUint8(3, TYPE_INPUT);
    view.setUint32(4, input.seq >>> 0, true);
    const flags = (input.left ? 1 : 0) | (input.right ? 2 : 0) | (input.thrust ? 4 : 0) | (input.brake ? 8 : 0);
    view.setUint8(8, flags);
    return buffer;
}
export function encodeSnapshot(snapshot) {
    const players = Array.isArray(snapshot.players) ? snapshot.players : [];
    const encodedPlayers = players.slice(0, 255).map((player) => ({
        player,
        id: encoder.encode(String(player.id ?? '')).subarray(0, 255),
        name: encoder.encode(String(player.name ?? '')).subarray(0, 255),
    }));
    const totalSize = SNAPSHOT_HEADER_SIZE + encodedPlayers.reduce((size, item) => size + PLAYER_FIXED_SIZE + item.id.length + item.name.length, 0);
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    view.setUint8(0, MAGIC_0);
    view.setUint8(1, MAGIC_1);
    view.setUint8(2, BINARY_PROTOCOL_VERSION);
    view.setUint8(3, TYPE_SNAPSHOT);
    view.setUint32(4, snapshot.tick >>> 0, true);
    view.setUint32(8, (snapshot.seed ?? 0) >>> 0, true);
    view.setUint8(12, Math.min(encodedPlayers.length, 255));
    let offset = SNAPSHOT_HEADER_SIZE;
    for (const { player, id, name } of encodedPlayers) {
        view.setUint8(offset, id.length);
        offset += 1;
        view.setUint8(offset, name.length);
        offset += 1;
        bytes.set(id, offset);
        offset += id.length;
        bytes.set(name, offset);
        offset += name.length;
        for (const key of ['x', 'y', 'vx', 'vy']) {
            const value = Number(player[key]);
            if (!Number.isFinite(value))
                throw new TypeError(`player.${key} must be finite`);
            view.setFloat32(offset, value, true);
            offset += 4;
        }
        const angle = Number.isFinite(player.angle) ? player.angle : 0;
        view.setInt16(offset, Math.max(-32767, Math.min(32767, Math.round(angle / Math.PI * 32767))), true);
        offset += 2;
        const ackSeq = Number.isSafeInteger(player.ackSeq) && player.ackSeq >= 0 && player.ackSeq <= 0xfffffffe ? player.ackSeq : 0xffffffff;
        view.setUint32(offset, ackSeq, true);
        offset += 4;
    }
    return buffer;
}
export function decodePacket(input) {
    let buffer;
    if (input instanceof ArrayBuffer) {
        buffer = input;
    }
    else if (ArrayBuffer.isView(input)) {
        const copy = new Uint8Array(input.byteLength);
        copy.set(new Uint8Array(input.buffer, input.byteOffset, input.byteLength));
        buffer = copy.buffer;
    }
    else {
        const offset = input.byteOffset ?? 0;
        const length = input.byteLength ?? input.buffer.byteLength;
        buffer = input.buffer.slice(offset, offset + length);
    }
    if (!buffer)
        throw new TypeError('Expected an ArrayBuffer or byte view');
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint8(0) !== MAGIC_0 || view.getUint8(1) !== MAGIC_1) {
        throw new TypeError('Invalid binary packet signature');
    }
    const version = view.getUint8(2);
    if (version !== BINARY_PROTOCOL_VERSION)
        throw new TypeError('Unsupported binary protocol version');
    const type = view.getUint8(3);
    if (type === TYPE_INPUT) {
        assertPacketHeader(view, TYPE_INPUT);
        if (view.byteLength !== INPUT_PACKET_SIZE)
            throw new TypeError('Invalid input packet size');
        const flags = view.getUint8(8);
        if (flags & 0xf0)
            throw new TypeError('Invalid input flags');
        return {
            type: 'input',
            seq: view.getUint32(4, true),
            left: Boolean(flags & 1),
            right: Boolean(flags & 2),
            thrust: Boolean(flags & 4),
            brake: Boolean(flags & 8),
        };
    }
    if (type === TYPE_SNAPSHOT) {
        assertPacketHeader(view, TYPE_SNAPSHOT);
        if (view.byteLength < SNAPSHOT_HEADER_SIZE)
            throw new TypeError('Invalid snapshot packet size');
        const tick = view.getUint32(4, true);
        const seed = view.getUint32(8, true);
        const count = view.getUint8(12);
        const bytes = new Uint8Array(buffer);
        const players = [];
        let offset = SNAPSHOT_HEADER_SIZE;
        for (let index = 0; index < count; index++) {
            if (offset + 2 > view.byteLength)
                throw new TypeError('Truncated snapshot player header');
            const idLength = view.getUint8(offset);
            offset += 1;
            const nameLength = view.getUint8(offset);
            offset += 1;
            const required = idLength + nameLength + PLAYER_FIXED_SIZE - 2;
            if (offset + required > view.byteLength)
                throw new TypeError('Truncated snapshot player data');
            const id = decoder.decode(bytes.subarray(offset, offset + idLength));
            offset += idLength;
            const name = decoder.decode(bytes.subarray(offset, offset + nameLength));
            offset += nameLength;
            const x = view.getFloat32(offset, true);
            offset += 4;
            const y = view.getFloat32(offset, true);
            offset += 4;
            const vx = view.getFloat32(offset, true);
            offset += 4;
            const vy = view.getFloat32(offset, true);
            offset += 4;
            const angle = view.getInt16(offset, true) / 32767 * Math.PI;
            offset += 2;
            const rawAck = view.getUint32(offset, true);
            offset += 4;
            players.push({ id, name, x, y, vx, vy, angle, ackSeq: rawAck === 0xffffffff ? -1 : rawAck });
        }
        if (offset !== view.byteLength)
            throw new TypeError('Unexpected trailing snapshot bytes');
        return { type: 'snapshot', tick, seed, players };
    }
    throw new TypeError(`Unknown binary packet type: ${type}`);
}
