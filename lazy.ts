export class Lazy<T> implements Iterable<T> {
    constructor(private iterable: Iterable<T>) { }

    map<U>(mapper: (t: T) => U): Lazy<U> {
        const self = this;
        return lazy(function* () {
            for (const element of self) yield mapper(element);
        } ());
    }

    async mapAsync<U>(mapper: (t: T) => Promise<U>): Promise<Lazy<U>> {
        //TODO: is this possible without waiting for all to complete?
        return lazy(await Promise.all([...this.map(mapper)]));
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

    sum(this: Lazy<number>) {
        return this.reduce((a, b) => a + b, 0);
    }

    /**
     * @example  lazy([1,1,1]).intersplice((left, right) => [left - right]).collect() // [1,0,1,0,1]
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

    unique() {
        return lazy(new Set(this));
    }

    join(this: Lazy<string>) {
        return [...this].join("");
    }

    collect() {
        return [...this];
    }

    [Symbol.iterator]() {
        return this.iterable[Symbol.iterator]();
    }
}

export function lazy<T>(iterable: Iterable<T>) {
    return new Lazy(iterable);
}