//! KITE Protocol, reference implementation.
//!
//! The protocol is a line language: one op per line, applied the moment the line ends.
//! A model, a person or a program writes ops; a renderer keeps a [`core::Board`] and draws it.
//! The same language writes the board back, so whoever edits it can read what is there.
//!
//! - [`lang`]: parse a line into an [`core::Op`], serialize a board, cut a token stream into lines.
//! - [`core`]: the board, the card types, and `Board::apply`, the one function every change passes through.
//!
//! The specification is `protocol/SPEC.md`. This crate has no dependencies.
//!
//! ```
//! use kite_protocol::{core::{Author, Board}, lang};
//!
//! let mut board = Board::default();
//! for line in ["topic trip Trip", "card k1 metric trip 2x2 Days left", "set k1 value 9"] {
//!     let op = lang::parse(line).unwrap().unwrap();
//!     board.apply(op, Author::Ai).unwrap();
//! }
//! assert_eq!(lang::serialize(&board), "topic trip Trip\ncard k1 metric trip 2x2 Days left\nset k1 value 9\n");
//! ```

pub mod core;
pub mod lang;

pub use crate::core::Reject;

/// The protocol version this implementation writes and reads (SPEC.md, Versioning).
pub const VERSION: &str = lang::VERSION;
