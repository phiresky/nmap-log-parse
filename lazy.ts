/**
 * Library for functional operations on lazily evaluated EcmaScript iterators / generators
 * 
 * For example,
 *     lazy([1,2,3,4,5]).map(x => x * x).filter(x => x > 5).forEach(x => console.log(x))
 * creates the same output as 
 *     [1,2,3,4,5].map(x => x * x).filter(x => x > 5).forEach(x => console.log(x))
 * but without creating any intermediary arrays.
 */
class Lazy<T> implements Iterable<T> {
    constructor(private iterable: Iterable<T>) { }
    //map<A,B>(mapper: (t: T) => [A, B]): Lazy<[A, B]>
    map<U>(mapper: ((t: T) => U)): Lazy<U> {
        const self = this;
        return lazy(function* () {
            for (const element of self) yield mapper(element);
        } ());
    }

    async awaitParallel<U>(this: Lazy<Promise<U>>): Promise<Lazy<U>> {
        return lazy(await Promise.all([...this]));
    }
    async awaitSequential<U>(this: Lazy<Promise<U>>): Promise<Lazy<U>> {
        const results: U[] = [];
        for(const promise of this) results.push(await promise);
        return lazy(results);
    }

    mapToTuple<A, B>(mapper: (t: T) => [A, B]): Lazy<[A, B]> {
        return this.map(mapper);
    }

    flatMap<U>(mapper: (t: T) => Iterable<U>) {
        const self = this;
        return lazy(function* () {
            for (const element of self) yield* mapper(element);
        } ());
    }

    toMap<K, V>(this: Lazy<[K, V]>): Map<K, V> {
        return new Map(this);
    }

    toMapKeyed<K, V>(keyGetter: (t: T) => K, valueGetter: (t: T) => V): Map<K, V> {
        return this.mapToTuple(t => [keyGetter(t), valueGetter(t)]).toMap();
    }

    filter(filter: (t: T) => boolean) {
        const self = this;
        return lazy(function* () {
            for (const element of self) if (filter(element)) yield element;
        } ());
    }
    /**
      * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to two arguments. The reduce method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: T) => U, initialValue: U): U {
        let previous = initialValue;
        for (const element of this) {
            previous = callbackfn(previous, element);
        }
        return previous;
    }

    /** forces evaluation */
    sort(keyGetter: ((t: T) => number | string)) {
        return lazy([...this].sort((a, b) => {
            const ak = keyGetter(a), bk = keyGetter(b);
            return ak < bk ? -1 : ak > bk ? 1 : 0;
        }));
    }

    chunk(limit: number): Lazy<Lazy<T>> {
        const self = this;
        return lazy(function* (): Iterable<Lazy<T>> {
            // must be cached in an array, otherwise it's impossible to know if the outer lazy is finished yet when the inner lazy has not been consumed
            let cache = [] as T[];
            for(const element of self) {
                cache.push(element);
                if(cache.length === limit) {
                    yield lazy(cache);
                    cache = [];
                }
            }
            if(cache.length > 0) yield lazy(cache);
        }());
    }

    sum(this: Lazy<number>) {
        return this.reduce((a, b) => a + b, 0);
    }

    /**
     * @example lazy([1,1,1]).intersplice((left, right) => [left - right]).collect() // [1,0,1,0,1]
     * @example lazy("testing").intersplice(() => [":"]) // "t:e:s:t:i:n:g"
     */
    intersplice<U>(between: (left: T, right: T) => Iterable<U>): Lazy<T | U> {
        const self = this;
        const nothing: T = {} as T;
        return lazy(function* (): Iterable<T | U> {
            let last = nothing;
            for (const element of self) {
                if (last !== nothing) yield* between(last, element);
                last = element;
                yield element;
            }
        } ());
    }

    zipWith<U, V>(other: Iterable<U>, combinator: (t: T, u: U) => V) {
        const self = this;
        return lazy(function* (): Iterable<V> {
            const selfIt = self[Symbol.iterator]();
            const otherIt = other[Symbol.iterator]();
            while (true) {
                const selfNext = selfIt.next();
                const otherNext = otherIt.next();
                if (selfNext.done || otherNext.done) return;
                yield combinator(selfNext.value, otherNext.value);
            }
        } ());
    }

    unique() {
        return lazy(new Set(this));
    }

    join(this: Lazy<number | string | boolean>) {
        return [...this].join("");
    }

    collect() {
        return [...this];
    }

    first() {
        return this[Symbol.iterator]().next().value;
    }

    forEach(consumer: (t: T) => void) {
        for (const element of this) consumer(element);
    }

    concat(other: Iterable<T>) {
        return lazy.concat(this, other);
    }

    prefetch(count: number) {
        const self = this;
        return lazy(function* () {
            const arr: T[] = [];
            for(const element of self) {
                arr.push(element);
                if(arr.length >= count) yield arr.shift()!;
            }
            yield* arr;
        }());
    }

    [Symbol.iterator]() {
        const it = this.iterable[Symbol.iterator]();
        this[Symbol.iterator] = () => {
            throw Error("this lazy was already consumed");
        }
        return it;
    }
}

export function lazy<T>(iterable: Iterable<T>) {
    return new Lazy(iterable);
}

export namespace lazy {
    export function concat<T>(...iterables: Iterable<T>[]) {
        return lazy(function* () {
            for (const it in iterables) yield* it;
        } ());
    }
}

(window as any).lazy = lazy;


function test() {
    var i = 0;
    function loggingPromise(me: number) {
        console.log("created:"+me);
        return new Promise(res => {
            console.log("funi:"+me);
            setTimeout(res, 500);
        });
    }
    lazy(Array.from(Array(10)).map((x,i) => i)).map(i => loggingPromise(i)).chunk(5).flatMap(x => x).awaitSequential();
}