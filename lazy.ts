/**
 * Library for functional operations on lazily evaluated ECMAScript iterators / generators
 *
 * For example,
 *
 *     lazy([1,2,3,4,5]).map(x => x * x).filter(x => x > 5).forEach(x => console.log(x))
 *
 * creates the same output as
 *
 *     [1,2,3,4,5].map(x => x * x).filter(x => x > 5).forEach(x => console.log(x))
 *
 * but without creating any intermediary arrays.
 */
class Lazy<T> implements Iterable<T> {
	constructor(private iterable: Iterable<T>) {}

	map<U>(mapper: (t: T) => U): Lazy<U> {
		const self = this;
		return lazy(
			(function*() {
				for (const element of self) yield mapper(element);
			})(),
		);
	}

	mapToTuple<A, B>(mapper: (t: T) => [A, B]): Lazy<[A, B]> {
		return this.map(mapper);
	}

	/**
	 * Replace every element with any number of new elements.
	 *
	 * @example
	 * ```ts
	 * lazy.range(0, 5).flatMap(i => lazy.generate(i, () => i))
	 * // => [1, 2, 2, 3, 3, 3, 4, 4, 4, 4]
	 * ```
	 */
	flatMap<U>(mapper: (t: T) => Iterable<U>) {
		const self = this;
		return lazy(
			(function*() {
				for (const element of self) yield* mapper(element);
			})(),
		);
	}

	/**
	 * Create an ECMAScript Map extracting a custom key and value from each element.
	 *
	 * @example
	 * ```ts
	 * const map = lazy([{name: "John", age: 24}, {name: "Jane", age: 22}])
	 *     .toMapKeyed(e => e.name, e => e);
	 * map.get("John"); // {name: "John", age: 24}
	 * ```
	 */
	toMapKeyed<K, V>(
		keyGetter: (t: T) => K,
		valueGetter: (t: T) => V,
	): Map<K, V> {
		return this.mapToTuple(t => [keyGetter(t), valueGetter(t)]).toMap();
	}

	/**
	 * Retain only elements matching the filter function.
	 */
	filter(filter: (t: T) => boolean) {
		const self = this;
		return lazy(
			(function*() {
				for (const element of self) if (filter(element)) yield element;
			})(),
		);
	}

	/**
	 * Calls the specified callback function for all the elements in an array.
	 * The return value of the callback function is the accumulated result, and
	 * is provided as an argument in the next call to the callback function.
	 */
	reduce<U>(
		callbackfn: (previousValue: U, currentValue: T) => U,
		initialValue: U,
	): U {
		let previous = initialValue;
		for (const element of this) {
			previous = callbackfn(previous, element);
		}
		return previous;
	}

	/**
	 * Sort the elements of this lazy in ascending order according to `keyGetter`.
	 *
	 * Forces complete evaluation.
	 */
	sort(keyGetter: (t: T) => number | string) {
		return lazy(
			[...this].sort((a, b) => {
				const ak = keyGetter(a),
					bk = keyGetter(b);
				return ak < bk ? -1 : ak > bk ? 1 : 0;
			}),
		);
	}

	/**
	 * Split this Lazy into multiple lazies of length `limit`.
	 * The last chunk may be shorter if the length is not dividable by `limit`.
	 *
	 * Forces partial evaluation of `limit` elements at a time.
	 */
	chunk(limit: number): Lazy<Lazy<T>> {
		const self = this;
		return lazy(
			(function*(): Iterable<Lazy<T>> {
				// must be cached in an array, otherwise it's impossible to know if the outer lazy
				// is finished yet when the inner lazy has not been consumed
				let cache = [] as T[];
				for (const element of self) {
					cache.push(element);
					if (cache.length === limit) {
						yield lazy(cache);
						cache = [];
					}
				}
				if (cache.length > 0) yield lazy(cache);
			})(),
		);
	}

	/**
	 * Insert new elements between every pair of existing elements
	 *
	 * @example
	 * ```ts
	 * lazy("testing").intersplice(() => [":"]) // "t:e:s:t:i:n:g"
	 * ```
	 */
	intersplice<U>(between: (left: T, right: T) => Iterable<U>): Lazy<T | U> {
		const self = this;
		const nothing: T = {} as T;
		return lazy(
			(function*(): Iterable<T | U> {
				let last = nothing;
				for (const element of self) {
					if (last !== nothing) yield* between(last, element);
					last = element;
					yield element;
				}
			})(),
		);
	}

	zipWith<U, V>(other: Iterable<U>, combinator: (t: T, u: U) => V) {
		const self = this;
		return lazy(
			(function*(): Iterable<V> {
				const selfIt = self[Symbol.iterator]();
				const otherIt = other[Symbol.iterator]();
				while (true) {
					const selfNext = selfIt.next();
					const otherNext = otherIt.next();
					if (selfNext.done || otherNext.done) return;
					yield combinator(selfNext.value, otherNext.value);
				}
			})(),
		);
	}

	unique() {
		return lazy(new Set(this));
	}

	collect() {
		return [...this];
	}

	first() {
		return this[Symbol.iterator]().next().value;
	}

	some(predicate: (t: T) => boolean) {
		for (const t of this) if (predicate(t)) return true;
		return false;
	}

	every(predicate: (t: T) => boolean) {
		for (const t of this) if (!predicate(t)) return false;
		return true;
	}

	forEach(consumer: (t: T) => void) {
		for (const element of this) consumer(element);
	}

	concat(other: Iterable<T>) {
		return lazy.concat(this, other);
	}

	/**
	 * Retrieve the given number of future elements before they are consumed. Useful for promises.
	 *
	 * @example The following will fetch the files {file1, file2, …, file10} three at a time.
	 * ```ts
	 * lazy.range(0,10)
	 *     .map(x => fetch("file" + x).then(response => response.text()))
	 *     .caching(3)
	 *     .awaitSequential()
	 *     .then(texts => texts.forEach(text => console.log(text)))
	 * ```
	 */
	caching(count: number) {
		const self = this;
		return lazy(
			(function*() {
				const arr: T[] = [];
				for (const element of self) {
					arr.push(element);
					if (arr.length >= count) yield arr.shift()!;
				}
				yield* arr;
			})(),
		);
	}

	[Symbol.iterator]() {
		const it = this.iterable[Symbol.iterator]();
		this[Symbol.iterator] = () => {
			throw Error("this lazy was already consumed");
		};
		return it;
	}

	// the following functions only work on some specific Lazy types

	toMap<K, V>(this: Lazy<[K, V]>): Map<K, V> {
		return new Map(this);
	}

	join(this: Lazy<number | string | boolean>) {
		return [...this].join("");
	}

	sum(this: Lazy<number>) {
		return this.reduce((a, b) => a + b, 0);
	}

	count() {
		let i = 0;
		for (const t of this) i++;
		return i;
	}

	/**
	 * convert a Lazy<Promise<T>> to a Promise<Lazy<T>>, starting all the promises in parallel.
	 *
	 * @example
	 * ```ts
	 * lazy.range(0,10)
	 *     .map(x => fetch("file" + x).then(response => response.text()))
	 *     .awaitParallel()
	 *     .then(texts => texts.forEach(text => console.log(text)))
	 * ```
	 * would fetch the files "file1, file2, …, file10" at the same time
	 */
	async awaitParallel<U>(this: Lazy<Promise<U>>): Promise<Lazy<U>> {
		return lazy(await Promise.all([...this]));
	}
	/**
	 * convert a Lazy<Promise<T>> to a Promise<Lazy<T>>, waiting for each promise to finish before starting the next one
	 *
	 * @example
	 * ```ts
	 * lazy.range(0,10)
	 *     .map(x => fetch("file" + x))
	 *     .awaitSequential()
	 *     .then(response => console.log(response))
	 * ```
	 * would fetch the files "file1, file2, …, file10" one after another
	 */
	async awaitSequential<U>(this: Lazy<Promise<U>>): Promise<Lazy<U>> {
		const results: U[] = [];
		for (const promise of this) results.push(await promise);
		return lazy(results);
	}
}

export function lazy<T>(iterable: Iterable<T>) {
	return new Lazy(iterable);
}

export namespace lazy {
	export function concat<T>(...iterables: Iterable<T>[]) {
		return lazy(
			(function*() {
				for (const it in iterables) yield* it;
			})(),
		);
	}
	export function range(begin: number, endExclusive: number, step = 1) {
		return lazy(
			(function*() {
				for (let i = begin; i < endExclusive; i += step) yield i;
			})(),
		);
	}
	export function generate<T>(count: number, producer: (index: number) => T) {
		return lazy.range(0, count).map(producer);
	}
}

(window as any).lazy = lazy;

function test() {
	function loggingPromise(me: number) {
		return new Promise(res => {
			console.log("evaluating:" + me);
			setTimeout(res, 500);
		});
	}
	lazy.range(0, 10)
		.map(i => loggingPromise(i))
		.chunk(5)
		.flatMap(x => x)
		.awaitSequential();
}
