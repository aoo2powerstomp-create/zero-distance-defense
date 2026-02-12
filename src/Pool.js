export class Pool {
    constructor(createFn, initialSize = 10) {
        this.createFn = createFn;
        this.pool = [];
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    get() {
        if (this.pool.length > 0) {
            const obj = this.pool.pop();
            obj.active = true;
            return obj;
        }
        const obj = this.createFn();
        obj.active = true;
        return obj;
    }

    release(obj) {
        obj.active = false;
        this.pool.push(obj);
    }
}
